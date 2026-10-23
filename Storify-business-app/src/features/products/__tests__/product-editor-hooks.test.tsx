import { onlineManager } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react-native';

import { renderAppHook, signInAs } from '@/__tests__/hooks';
import { isNetworkError } from '@/api/errors';
import { state } from '@/api/mocks/state';
import { allMockProducts, changeMockProduct } from '@/api/mocks/routes/products';
import { queryClient } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import type { ProductCreateRequest } from '@/contracts/mobile/biz/v1';
import { useWorkspace } from '@/features/workspace/use-workspace';
import { authClient } from '@/lib/auth-client';

import {
  ProductEditorConflict,
  ProductEditorScopeChanged,
  ProductEditorUnconfirmed,
  useCreateFullProduct,
  useProductEditor,
  useSaveFullProduct,
} from '../use-product-editor';

const mockKeys: string[] = [];
let mockUnconfirmed = false;
let mockHold = false;
let mockLate = false;
let mockRelease: (() => void) | undefined;
let restoreGrant: (() => void) | undefined;
jest.mock('@/api/transport', () => ({
  transport: async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const server = jest.requireActual('@/api/mocks/server') as typeof import('@/api/mocks/server');
    const write =
      ['POST', 'PATCH'].includes(init?.method ?? '') &&
      /\/products(?:\/[^/]+\/editor)?$/.test(String(input));
    if (write) mockKeys.push(new Headers(init?.headers).get('idempotency-key') ?? '');
    const response = await server.mockFetch(input, init);
    if (write && mockUnconfirmed) {
      mockUnconfirmed = false;
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
    if (write && mockHold) {
      await new Promise<never>((_resolve, reject) => {
        const abort = () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        if (init?.signal?.aborted) abort();
        else init?.signal?.addEventListener('abort', abort, { once: true });
      });
    }
    if (write && mockLate) {
      await new Promise<void>((resolve) => {
        mockRelease = resolve;
      });
    }
    return response;
  },
}));
const input: ProductCreateRequest = {
  draftId: '57259480-0c11-4e2e-9ef2-56f71fc29cce',
  values: {
    name: 'New mobile product',
    description: '<p>Full product description.</p>',
    price: 11,
    category: 'category_home',
    stock: 7,
    shipping: { isPhysicalProduct: true },
  },
};
beforeEach(() => {
  mockKeys.length = 0;
  mockUnconfirmed = false;
  mockHold = false;
  mockLate = false;
  mockRelease = undefined;
  onlineManager.setOnline(true);
});
afterEach(() => {
  onlineManager.setOnline(true);
  restoreGrant?.();
  restoreGrant = undefined;
});

async function creation() {
  await signInAs('admin@example.com');
  const rendered = await renderAppHook(() => ({
    create: useCreateFullProduct(),
    workspace: useWorkspace(),
  }));
  await waitFor(() => expect(rendered.result.current.workspace.status).toBe('ready'));
  return rendered;
}
async function editing() {
  await signInAs('admin@example.com');
  const rendered = await renderAppHook(() => ({
    editor: useProductEditor('prod_vase'),
    save: useSaveFullProduct('prod_vase'),
  }));
  await waitFor(() => expect(rendered.result.current.editor.data).toBeDefined());
  return rendered;
}

it('does not send or queue initial inventory while offline', async () => {
  const { result } = await creation();
  onlineManager.setOnline(false);
  let error: unknown;
  await act(async () => {
    await result.current.create.submit(input).catch((caught) => {
      error = caught;
    });
  });
  expect(isNetworkError(error)).toBe(true);
  expect(mockKeys).toHaveLength(0);
  onlineManager.setOnline(true);
  await act(() => result.current.create.submit(input));
  expect(mockKeys).toHaveLength(1);
});

it('blocks changed creation payloads while uncertain and recovers one created product by reading', async () => {
  const { result } = await creation();
  const before = allMockProducts().length;
  mockUnconfirmed = true;
  let error: unknown;
  await act(async () => {
    await result.current.create.submit(input).catch((caught) => {
      error = caught;
    });
  });
  expect(error).toBeInstanceOf(ProductEditorUnconfirmed);
  const key = result.current.create.operationKey!;
  await act(async () => {
    await expect(
      result.current.create.submit({ ...input, values: { ...input.values, price: 22 } })
    ).rejects.toBeInstanceOf(ProductEditorUnconfirmed);
  });
  expect(mockKeys).toHaveLength(1);
  await act(async () => {
    const recovered = await result.current.create.recover(key);
    expect(recovered.product?.values.price).toBe(11);
    expect(recovered.product?.product.stock).toBe(7);
  });
  expect(mockKeys).toHaveLength(1);
  expect(allMockProducts()).toHaveLength(before + 1);
});

it('a same-payload retry reuses the original key and initial stock once', async () => {
  const { result } = await creation();
  mockUnconfirmed = true;
  await act(async () => {
    await result.current.create.submit(input).catch(() => undefined);
  });
  await act(async () => {
    const replay = await result.current.create.submit(input);
    expect(replay.product?.product.stock).toBe(7);
  });
  expect(mockKeys).toHaveLength(2);
  expect(new Set(mockKeys).size).toBe(1);
});

it('recovers a durable creation after the original hook has unmounted', async () => {
  const rendered = await creation();
  mockUnconfirmed = true;
  await act(async () => {
    await rendered.result.current.create.submit(input).catch(() => undefined);
  });
  const key = rendered.result.current.create.operationKey!;
  await rendered.unmount();
  const reopened = await renderAppHook(() => useCreateFullProduct());
  await act(async () => {
    const restored = await reopened.result.current.recover(key);
    expect(restored.product?.values.name).toBe(input.values.name);
  });
  expect(mockKeys).toHaveLength(1);
});

it('rebases unrelated changes after certified refusal with a fresh key and version', async () => {
  const { result } = await editing();
  const base = result.current.editor.data!;
  changeMockProduct(base.id, (product) => {
    product.price = 31;
  });
  await act(async () => {
    const saved = await result.current.save.submit({
      base,
      request: { changes: { name: 'Renamed from mobile' } },
    });
    expect(saved.product?.values).toMatchObject({ name: 'Renamed from mobile', price: 31 });
  });
  expect(mockKeys).toHaveLength(2);
  expect(new Set(mockKeys).size).toBe(2);
});

it('keeps the operator request and current store values on same-field conflicts', async () => {
  const { result } = await editing();
  const base = result.current.editor.data!;
  changeMockProduct(base.id, (product) => {
    product.name = 'Name from another operator';
  });
  let error: unknown;
  await act(async () => {
    await result.current.save
      .submit({ base, request: { changes: { name: 'My product name' } } })
      .catch((caught) => {
        error = caught;
      });
  });
  expect(error).toBeInstanceOf(ProductEditorConflict);
  expect((error as ProductEditorConflict).request.changes.name).toBe('My product name');
  expect((error as ProductEditorConflict).current.values.name).toBe('Name from another operator');
  expect(mockKeys).toHaveLength(1);
});

it('does not mistake an offline tap after success for an uncertain previous operation', async () => {
  const { result } = await creation();
  await act(() => result.current.create.submit(input));
  onlineManager.setOnline(false);
  await act(async () => {
    await result.current.create
      .submit({ ...input, values: { ...input.values, name: 'Another product' } })
      .catch(() => undefined);
  });
  expect(result.current.create.original()).toBeNull();
  expect(mockKeys).toHaveLength(1);
});

it('abandons a late response after sign-out and never publishes private product data', async () => {
  const { result } = await creation();
  mockHold = true;
  let outcome: unknown;
  let request: Promise<unknown> | undefined;
  await act(async () => {
    request = result.current.create.submit(input).catch((caught) => {
      outcome = caught;
    });
    await Promise.resolve();
  });
  await waitFor(() => expect(mockKeys).toHaveLength(1));
  await act(async () => {
    await authClient.signOut();
  });
  await act(async () => {
    await request;
  });
  expect(outcome).toBeDefined();
  expect(result.current.create.operationKey).toBeNull();
  expect(
    queryClient.getQueryData(
      queryKeys.product({ workspace: 'platform', locale: 'en' }, allMockProducts().at(-1)!.id)
    )
  ).toBeUndefined();
});

it('does not publish a completed write after the initiating editor has unmounted', async () => {
  const rendered = await creation();
  mockLate = true;
  let outcome: unknown;
  let request: Promise<unknown> | undefined;
  await act(async () => {
    request = rendered.result.current.create.submit(input).catch((caught) => {
      outcome = caught;
    });
    await Promise.resolve();
  });
  await waitFor(() => expect(mockRelease).toBeDefined());
  await rendered.unmount();
  await act(async () => {
    mockRelease!();
    await request;
  });
  expect(outcome).toBeInstanceOf(ProductEditorScopeChanged);
  expect(
    queryClient.getQueryData(
      queryKeys.product({ workspace: 'platform', locale: 'en' }, allMockProducts().at(-1)!.id)
    )
  ).toBeUndefined();
});

it('does not publish a late product write into another workspace', async () => {
  await signInAs('both@example.com');
  const grant = [...state.sessions.values()]
    .find((account) => account.email === 'both@example.com')!
    .grants.find((item) => item.workspace === 'platform')!;
  const original = grant.capabilities;
  grant.capabilities = [...original, 'CREATE_PRODUCTS'];
  restoreGrant = () => {
    grant.capabilities = original;
  };
  const rendered = await renderAppHook(() => ({
    create: useCreateFullProduct(),
    workspace: useWorkspace(),
  }));
  await waitFor(() => expect(rendered.result.current.workspace.status).toBe('choose'));
  await act(() => rendered.result.current.workspace.chooseWorkspace('platform'));
  await waitFor(() => expect(rendered.result.current.workspace.status).toBe('ready'));
  mockLate = true;
  let outcome: unknown;
  let request: Promise<unknown> | undefined;
  await act(async () => {
    request = rendered.result.current.create.submit(input).catch((caught) => {
      outcome = caught;
    });
    await Promise.resolve();
  });
  await waitFor(() => expect(mockRelease).toBeDefined());
  await act(() => rendered.result.current.workspace.chooseWorkspace('vendor'));
  await act(async () => {
    mockRelease!();
    await request;
  });
  expect(allMockProducts().at(-1)?.name).toBe(input.values.name);
  expect(outcome).toBeInstanceOf(ProductEditorScopeChanged);
  expect(rendered.result.current.create.operationKey).toBeNull();
  for (const workspace of ['platform', 'vendor'] as const)
    expect(
      queryClient.getQueryData(
        queryKeys.product({ workspace, locale: 'en' }, allMockProducts().at(-1)!.id)
      )
    ).toBeUndefined();
});
