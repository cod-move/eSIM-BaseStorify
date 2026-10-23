import { act, waitFor } from '@testing-library/react-native';

import { isApiError, isNetworkError } from '@/api/errors';
import type { Cached } from '@/api/etag-query';
import { raceNextOrderAction } from '@/api/mocks/routes/orders';
import { changeMockProduct } from '@/api/mocks/routes/products';
import { loseNextAnswer } from '@/api/mocks/server';
import { queryClient } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import type { OrderDetail, Workspace } from '@/contracts/mobile/biz/v1';
import { useHome } from '@/features/home/use-home';
import { useOrder, useOrderAction } from '@/features/orders/use-orders';
import { ProductChangedError } from '@/features/products/product-changes';
import {
  useProduct,
  useProductStock,
  useStockAdjustment,
  useUpdateProduct,
} from '@/features/products/use-products';
import { useWorkspace } from '@/features/workspace/use-workspace';
import { useErrorMessage } from '@/i18n/use-error-message';

import { renderAppHook, signInAs } from './hooks';

describe('an order action', () => {
  function useOrderScreen(id: string) {
    return {
      order: useOrder(id),
      action: useOrderAction(id),
      home: useHome(),
      say: useErrorMessage(),
    };
  }

  it('replaces the order with the answer, and refreshes Home', async () => {
    await signInAs('admin@example.com');
    const { result } = await renderAppHook(() => useOrderScreen('ord_1040'));
    await waitFor(() => expect(result.current.order.data?.status).toBe('pending'));
    await waitFor(() => expect(result.current.home.data).toBeDefined());
    const needing = () =>
      result.current.home.data?.tiles.find((tile) => tile.kind === 'ORDERS_NEEDING_ACTION')?.count;
    const before = needing();

    await act(() => result.current.action.submit({ action: 'cancel', reason: 'Asked to cancel' }));

    expect(result.current.order.data?.status).toBe('cancelled');
    await waitFor(() => expect(needing()).toBe((before ?? 0) - 1));
  });

  it('shows the order as somebody else left it when the action lost the race', async () => {
    await signInAs('admin@example.com');
    raceNextOrderAction('ord_1040', (order) => {
      for (const part of order.consignments) part.status = 'processing';
    });
    const { result } = await renderAppHook(() => useOrderScreen('ord_1040'));
    await waitFor(() => expect(result.current.order.data?.status).toBe('pending'));

    const error = await act(() =>
      result.current.action.submit({ action: 'mark_processing' }).catch((caught) => caught)
    );

    expect(isApiError(error) && error.reason).toBe('ORDER_STATE_CHANGED');
    expect(result.current.say(error)).toBe(
      'Someone else just changed this order. Here it is as it is now.'
    );
    expect(result.current.order.data?.status).toBe('processing');
  });

  it('puts the answer in the workspace the step went out from, when the operator switches meanwhile', async () => {
    await signInAs('both@example.com');
    const { result } = await renderAppHook(() => ({
      workspace: useWorkspace(),
      action: useOrderAction('ord_1040'),
    }));
    await waitFor(() => expect(result.current.workspace.status).toBe('choose'));
    await act(async () => result.current.workspace.chooseWorkspace('platform'));
    await waitFor(() => expect(result.current.workspace.status).toBe('ready'));

    // The step is made and its answer lost: the tap tries again a second later,
    // and meanwhile the operator switches to the seller's shop.
    loseNextAnswer();
    let step: Promise<unknown> = Promise.resolve();
    await act(async () => {
      step = result.current.action.submit({ action: 'mark_processing' });
    });
    await act(async () => result.current.workspace.chooseWorkspace('vendor'));
    await act(() => step);
    // What the step's end asks again lands within the test's act.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    const held = (workspace: Workspace) =>
      queryClient.getQueryData<Cached<OrderDetail>>(
        queryKeys.order({ locale: 'en', workspace }, 'ord_1040')
      );
    expect(held('vendor')).toBeUndefined();
    expect(held('platform')?.data.status).toBe('processing');
  });
});

describe('a stock adjustment', () => {
  it('sends the same key again when the answer was lost, so the units count once', async () => {
    await signInAs('seller@example.com');
    const { result } = await renderAppHook(() => ({
      stock: useProductStock('prod_towel'),
      adjust: useStockAdjustment('prod_towel'),
    }));
    await waitFor(() => expect(result.current.stock.data?.rows[0]?.available).toBe(3));

    loseNextAnswer();
    await act(() =>
      result.current.adjust.submit({
        adjustment: { locationId: 'loc_green', delta: 5, reason: 'received' },
        draft: 'sheet-1',
      })
    );

    await waitFor(() => expect(result.current.stock.data?.rows[0]?.available).toBe(8));
  });

  it('keeps an unanswered change’s key while another sheet adjusts the same product', async () => {
    // The tap's tries wait a second, then two.
    jest.useFakeTimers();
    try {
      await adjustTwoVariants();
    } finally {
      jest.useRealTimers();
    }
  });

  async function adjustTwoVariants(): Promise<void> {
    await signInAs('seller@example.com');
    const { result } = await renderAppHook(() => ({
      stock: useProductStock('prod_mug'),
      adjust: useStockAdjustment('prod_mug'),
    }));
    await waitFor(() => expect(result.current.stock.data).toBeDefined());
    const available = (variant: string) =>
      result.current.stock.data?.rows.find((row) => row.variantId === variant)?.available;
    const sage = available('var_mug_sage') ?? 0;
    const sand = available('var_mug_sand') ?? 0;
    const sageFive = {
      adjustment: {
        locationId: 'loc_green',
        variantId: 'var_mug_sage',
        delta: 5,
        reason: 'received' as const,
      },
      draft: 'sheet-1',
    };

    // Made by the store; none of the tap's three tries hears back.
    loseNextAnswer(3);
    const unanswered = result.current.adjust.submit(sageFive).catch((caught: unknown) => caught);
    await act(() => jest.advanceTimersByTimeAsync(3500));
    expect(isNetworkError(await unanswered)).toBe(true);

    // Another sheet counts a unit of another variant.
    await act(() =>
      result.current.adjust.submit({
        adjustment: {
          locationId: 'loc_green',
          variantId: 'var_mug_sand',
          delta: 1,
          reason: 'count',
        },
        draft: 'sheet-2',
      })
    );
    // "Try again" in the first sheet: its own key, so the five count once.
    await act(() => result.current.adjust.submit(sageFive));

    // The answer to a retried key is the first try's, replayed, from before the
    // other sheet's unit: the stock is read again behind it.
    await waitFor(() => expect(available('var_mug_sand')).toBe(sand + 1));
    expect(available('var_mug_sage')).toBe(sage + 5);
  }
});

describe('a product change', () => {
  function useProductScreen() {
    return { product: useProduct('prod_vase'), update: useUpdateProduct('prod_vase') };
  }

  it('goes through when only a sale moved the version meanwhile', async () => {
    await signInAs('admin@example.com');
    const { result } = await renderAppHook(useProductScreen);
    await waitFor(() => expect(result.current.product.data).toBeDefined());
    const base = result.current.product.data!;
    changeMockProduct('prod_vase', (product) => {
      const row = product.stock.loc_main;
      if (row) row.available -= 1;
    });

    const saved = await act(() =>
      result.current.update.mutateAsync({ changes: { price: 26 }, base })
    );

    expect(saved.price?.amount).toBe(26);
    expect(saved.version).not.toBe(base.version);
    // The cache tells the hook on a timer of its own: wait for it.
    await waitFor(() => expect(result.current.product.data?.price?.amount).toBe(26));
  });

  it('stops when somebody else changed the same field, showing their change', async () => {
    await signInAs('admin@example.com');
    const { result } = await renderAppHook(useProductScreen);
    await waitFor(() => expect(result.current.product.data).toBeDefined());
    const base = result.current.product.data!;
    changeMockProduct('prod_vase', (product) => {
      product.price = 28;
    });

    const error = await act(() =>
      result.current.update.mutateAsync({ changes: { price: 26 }, base }).catch((caught) => caught)
    );

    expect(error).toBeInstanceOf(ProductChangedError);
    await waitFor(() => expect(result.current.product.data?.price?.amount).toBe(28));
  });
});
