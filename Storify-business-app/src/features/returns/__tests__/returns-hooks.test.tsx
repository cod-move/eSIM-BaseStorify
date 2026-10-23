import { onlineManager } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react-native';
import { renderAppHook, signInAs } from '@/__tests__/hooks';
import { isNetworkError } from '@/api/errors';
import { AlreadySending } from '@/api/keyed-mutation';
import { executeRefund, previewRefund } from '@/api/endpoints/returns';
import { changeMockOperation } from '@/api/mocks/routes/operations';
import { changeMockRefund, setNextMockRefundStatus } from '@/api/mocks/routes/returns';
import { queryClient } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import { type ReturnCreateRequest, type Me, type RefundResult } from '@/contracts/mobile/biz/v1';
import { useSessionSync } from '@/features/auth/use-session-sync';
import { authClient } from '@/lib/auth-client';
import { useWorkspace } from '@/features/workspace/use-workspace';
import {
  ReturnScopeChanged,
  ReturnUnconfirmed,
  useReturnOptions,
  useReturnWrite,
  useRefund,
  useRefundPreview,
} from '../use-returns';
import { useReturnStore } from '../store';
const mockKeys: string[] = [];
let mockUnknown = false;
let mockHold = false;
let mockRelease: (() => void) | undefined;
jest.mock('@/api/transport', () => ({
  transport: async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const { mockFetch } = jest.requireActual(
      '@/api/mocks/server'
    ) as typeof import('@/api/mocks/server');
    const write =
      init?.method === 'POST' &&
      /\/(returns|returns\/[^/]+\/actions|refunds\/execute)$/.test(String(input));
    if (write) mockKeys.push(new Headers(init?.headers).get('idempotency-key')!);
    const response = await mockFetch(input, init);
    if (write && mockUnknown) {
      mockUnknown = false;
      const body = await response.json();
      return new Response(
        JSON.stringify({
          success: false,
          code: 'CONFLICT',
          reason: 'OPERATION_RECONCILIATION_REQUIRED',
          details: { operation: { ...body.data.operation, state: 'unknown' } },
        }),
        { status: 409 }
      );
    }
    if (write && mockHold)
      await new Promise<void>((resolve) => {
        mockRelease = resolve;
      });
    return response;
  },
}));
beforeEach(() => {
  mockKeys.length = 0;
  mockUnknown = false;
  mockHold = false;
  mockRelease = undefined;
  onlineManager.setOnline(true);
});
afterEach(() => {
  onlineManager.setOnline(true);
});
async function creation() {
  await signInAs('admin@example.com');
  const rendered = await renderAppHook(() => {
    useSessionSync();
    return {
      workspace: useWorkspace(),
      options: useReturnOptions('ord_1036'),
      writer: useReturnWrite('create', 'ord_1036'),
    };
  });
  await waitFor(() => expect(rendered.result.current.options.data).toBeDefined());
  const body: ReturnCreateRequest = {
    orderId: 'ord_1036',
    version: rendered.result.current.options.data!.version,
    items: [{ index: 0, quantity: 1 }],
    reason: 'wrong_size_or_variant',
    resolution: 'refund',
    returnMethod: 'customer_ships',
  };
  return { ...rendered, body };
}
it('sends nothing offline and never queues a return', async () => {
  const { result, body } = await creation();
  onlineManager.setOnline(false);
  let error: unknown;
  await act(async () => {
    await result.current.writer.submit({ kind: 'create', request: body }).catch((e) => {
      error = e;
    });
  });
  expect(isNetworkError(error)).toBe(true);
  expect(mockKeys).toHaveLength(0);
  await act(async () => {
    onlineManager.setOnline(true);
    await Promise.resolve();
  });
  expect(mockKeys).toHaveLength(0);
});
it('rejects double taps and publishes only the authoritative case', async () => {
  const { result, body } = await creation();
  mockHold = true;
  let first: Promise<unknown>;
  let second: unknown;
  await act(async () => {
    first = result.current.writer.submit({ kind: 'create', request: body });
    await result.current.writer.submit({ kind: 'create', request: body }).catch((e) => {
      second = e;
    });
  });
  expect(second).toBeInstanceOf(AlreadySending);
  await waitFor(() => expect(mockRelease).toBeDefined());
  mockHold = false;
  await act(async () => {
    mockRelease!();
    await first!;
  });
  expect(mockKeys).toHaveLength(1);
  expect(result.current.writer.attempt).toBeUndefined();
  const cache = queryClient
    .getQueryCache()
    .findAll({ queryKey: ['private', 'workspace', 'platform', 'returns'] });
  expect(cache.some((q) => q.queryKey.includes('ret_1'))).toBe(true);
});
it('locks changed writes after an uncertain response and recovers with GET only', async () => {
  const { result, body } = await creation();
  mockUnknown = true;
  let error: unknown;
  await act(async () => {
    await result.current.writer.submit({ kind: 'create', request: body }).catch((e) => {
      error = e;
    });
  });
  expect(error).toBeInstanceOf(ReturnUnconfirmed);
  expect(result.current.writer.attempt?.key).toBe(mockKeys[0]);
  await act(async () => {
    await result.current.writer
      .submit({ kind: 'create', request: { ...body, note: 'Changed draft' } })
      .catch((e) => {
        error = e;
      });
  });
  expect(error).toBeInstanceOf(ReturnUnconfirmed);
  let recovered: unknown;
  await act(async () => {
    recovered = await result.current.writer.recover();
  });
  expect(recovered).toMatchObject({
    operation: { state: 'succeeded' },
    returns: [{ orderId: 'ord_1036' }],
  });
  expect(mockKeys).toHaveLength(1);
  expect(result.current.writer.attempt).toBeUndefined();
});
it('keeps pending and unknown reconciliation locked without another POST', async () => {
  const { result, body } = await creation();
  mockUnknown = true;
  await act(async () => {
    await result.current.writer.submit({ kind: 'create', request: body }).catch(() => undefined);
  });
  changeMockOperation(mockKeys[0]!, (op) => ({ ...op, state: 'pending' }));
  let error: unknown;
  await act(async () => {
    await result.current.writer.recover().catch((e) => {
      error = e;
    });
  });
  expect(error).toBeInstanceOf(ReturnUnconfirmed);
  expect(result.current.writer.attempt).toBeDefined();
  expect(mockKeys).toHaveLength(1);
});
it('does not restore private caches after the editor unmounts', async () => {
  const { result, body, unmount } = await creation();
  mockHold = true;
  let pending: Promise<unknown>;
  let error: unknown;
  await act(async () => {
    pending = result.current.writer.submit({ kind: 'create', request: body }).catch((e) => {
      error = e;
    });
  });
  await waitFor(() => expect(mockRelease).toBeDefined());
  await unmount();
  mockHold = false;
  await act(async () => {
    mockRelease!();
    await pending!;
  });
  expect(error).toBeInstanceOf(ReturnScopeChanged);
  expect(
    queryClient.getQueryData(
      queryKeys.returnDetail({ locale: 'en', workspace: 'platform' }, 'ret_1')
    )
  ).toBeUndefined();
});
it('clears drafts and rejects a delayed reply after sign-out', async () => {
  const { result, body } = await creation();
  mockHold = true;
  let pending: Promise<unknown>;
  let error: unknown;
  await act(async () => {
    pending = result.current.writer.submit({ kind: 'create', request: body }).catch((e) => {
      error = e;
    });
  });
  await waitFor(() => expect(mockRelease).toBeDefined());
  await act(async () => {
    await authClient.signOut();
  });
  mockHold = false;
  await act(async () => {
    mockRelease!();
    await pending!;
  });
  expect(error).toBeInstanceOf(ReturnScopeChanged);
  expect(useReturnStore.getState().entries).toEqual({});
  expect(
    queryClient.getQueryData(
      queryKeys.returnDetail({ locale: 'en', workspace: 'platform' }, 'ret_1')
    )
  ).toBeUndefined();
});
it('aborts a delayed write after its capability is revoked', async () => {
  const { result, body } = await creation();
  mockHold = true;
  let pending: Promise<unknown>;
  let error: unknown;
  await act(async () => {
    pending = result.current.writer.submit({ kind: 'create', request: body }).catch((e) => {
      error = e;
    });
  });
  await waitFor(() => expect(mockRelease).toBeDefined());
  await act(async () => {
    queryClient.setQueryData<Me>(queryKeys.me('en'), (me) =>
      me
        ? {
            ...me,
            workspaces: me.workspaces.map((w) => ({
              ...w,
              capabilities: w.capabilities.filter((c) => c !== 'HANDLE_RETURNS'),
            })),
          }
        : me
    );
  });
  await waitFor(() => {
    const workspace = result.current.workspace;
    expect(
      workspace.status === 'ready' && workspace.access.capabilities.includes('HANDLE_RETURNS')
    ).toBe(false);
  });
  mockHold = false;
  await act(async () => {
    mockRelease!();
    await pending!;
  });
  expect(error).toBeInstanceOf(ReturnScopeChanged);
  expect(useReturnStore.getState().entries).toEqual({});
});
it('refreshes a processing refund by reading its receipt, never executing it again', async () => {
  await signInAs('admin@example.com');
  const ready = await renderAppHook(() => useWorkspace());
  await waitFor(() => expect(ready.result.current.status).toBe('ready'));
  const scope = { locale: 'en', workspace: 'platform' } as const;
  const preview = { target: { kind: 'order', id: 'ord_1041' } as const, amount: 10 };
  const quote = await previewRefund(scope, preview);
  setNextMockRefundStatus('processing');
  const receipt = await executeRefund(
    scope,
    { preview, previewToken: quote.token },
    '9340638f-1a65-471d-b84a-0b07da845f03'
  );
  const rendered = await renderAppHook(() => useRefund(receipt.refundId));
  await waitFor(() => expect(rendered.result.current.data?.settlementStatus).toBe('processing'));
  changeMockRefund(receipt.refundId, 'succeeded');
  await act(async () => {
    await rendered.result.current.refetch();
  });
  await waitFor(() => expect(rendered.result.current.data?.settlementStatus).toBe('succeeded'));
  expect(mockKeys).toHaveLength(1);
  const cached = queryClient.getQueryData<{ data: { paymentStatus: string } }>(
    queryKeys.order(scope, 'ord_1041')
  );
  expect(cached?.data.paymentStatus).toBe('partially_refunded');
});
it('reconciles an uncertain refund to its receipt without paying twice', async () => {
  await signInAs('admin@example.com');
  const rendered = await renderAppHook(() => ({
    workspace: useWorkspace(),
    review: useRefundPreview(),
    writer: useReturnWrite('refund', 'order:ord_1041'),
  }));
  await waitFor(() => expect(rendered.result.current.workspace.status).toBe('ready'));
  const preview = { target: { kind: 'order', id: 'ord_1041' } as const, amount: 10 };
  let quote: Awaited<ReturnType<typeof previewRefund>>;
  await act(async () => {
    quote = await rendered.result.current.review.review(preview);
  });
  mockUnknown = true;
  await act(async () => {
    await rendered.result.current.writer
      .submit({ kind: 'refund', request: { preview, previewToken: quote!.token } })
      .catch(() => undefined);
  });
  let recovered: RefundResult | undefined;
  await act(async () => {
    const result = await rendered.result.current.writer.recover();
    if ('refundId' in result) recovered = result;
  });
  expect(recovered?.settlementStatus).toBe('succeeded');
  expect(mockKeys).toHaveLength(1);
});
