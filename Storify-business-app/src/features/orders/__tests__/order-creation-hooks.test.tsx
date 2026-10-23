import { onlineManager } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react-native';
import { renderAppHook, signInAs } from '@/__tests__/hooks';
import { isNetworkError } from '@/api/errors';
import { quoteOrder } from '@/api/endpoints/order-creation';
import { allMockOrders } from '@/api/mocks/routes/orders';
import { allMockProducts } from '@/api/mocks/routes/products';
import { allMockOrderContacts } from '@/api/mocks/routes/order-creation';
import { state } from '@/api/mocks/state';
import { queryClient } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import type { Cached } from '@/api/etag-query';
import type {
  ManualOrderDraftRequest,
  ManualOrderCreateRequest,
  ManualOrderCreateResult,
} from '@/contracts/mobile/biz/v1';
import { useWorkspace } from '@/features/workspace/use-workspace';
import { authClient } from '@/lib/auth-client';
import {
  CreationScopeChanged,
  CreationUnconfirmed,
  useCreateManualOrder,
  useCreateOrderContact,
} from '../use-order-creation';

const mockKeys: string[] = [];
let mockUnknown = false;
let mockHold = false;
let mockRelease: (() => void) | undefined;
let restoreGrant: (() => void) | undefined;
/** The next writes never reach the store: its front answers 503, to be tried again at once. */
let mockFaults = 0;
/** The next write is refused by a check before the store looks at its key. */
let mockRefusal: { status: number; code: string; reason: string } | undefined;
jest.mock('@/api/transport', () => ({
  transport: async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const { mockFetch } = jest.requireActual(
      '@/api/mocks/server'
    ) as typeof import('@/api/mocks/server');
    const write =
      init?.method === 'POST' && /\/orders\/creation(?:\/contacts)?$/.test(String(input));
    if (write) mockKeys.push(new Headers(init?.headers).get('idempotency-key')!);
    if (write && mockFaults > 0) {
      mockFaults -= 1;
      return new Response(JSON.stringify({ success: false, code: 'SERVICE_UNAVAILABLE' }), {
        status: 503,
        headers: { 'retry-after': '0' },
      });
    }
    if (write && mockRefusal) {
      const { status, ...refusal } = mockRefusal;
      mockRefusal = undefined;
      return new Response(JSON.stringify({ success: false, ...refusal }), { status });
    }
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
const draft: ManualOrderDraftRequest = {
  draftId: '4634d76c-9748-43bc-aecc-600c8443fc99',
  items: [{ productId: 'prod_vase', quantity: 2 }],
  customer: { kind: 'guest', name: 'Hook customer', email: 'hook@example.com' },
  locationId: 'loc_main',
  deliveryId: 'pickup:loc_main',
  paymentMethod: 'manual_pending',
};
beforeEach(() => {
  mockKeys.length = 0;
  mockUnknown = false;
  mockHold = false;
  mockRelease = undefined;
  mockFaults = 0;
  mockRefusal = undefined;
  onlineManager.setOnline(true);
});
afterEach(() => {
  restoreGrant?.();
  restoreGrant = undefined;
  mockRelease?.();
  onlineManager.setOnline(true);
  jest.restoreAllMocks();
});
async function ready() {
  await signInAs('admin@example.com');
  const hook = await renderAppHook(() => ({
    create: useCreateManualOrder(draft.draftId),
    contact: useCreateOrderContact(draft.draftId),
    workspace: useWorkspace(),
  }));
  await waitFor(() => expect(hook.result.current.workspace.status).toBe('ready'));
  const quote = await act(() => quoteOrder({ locale: 'en', workspace: 'platform' }, draft));
  return {
    ...hook,
    request: { draft, quoteToken: quote.token } satisfies ManualOrderCreateRequest,
  };
}

it('does not send or queue stock/payment effects while offline', async () => {
  const { result, request } = await ready();
  await act(() => onlineManager.setOnline(false));
  let error: unknown;
  await act(async () => {
    await result.current.create.submit(request).catch((caught) => {
      error = caught;
    });
  });
  expect(isNetworkError(error)).toBe(true);
  expect(mockKeys).toHaveLength(0);
  expect(result.current.create.original()).toBeNull();
});

it('blocks double taps and caches the actual order in the existing conditional-query shape', async () => {
  const { result, request } = await ready();
  mockHold = true;
  let first: Promise<ManualOrderCreateResult> | undefined;
  await act(async () => {
    first = result.current.create.submit(request);
    await Promise.resolve();
  });
  await waitFor(() => expect(mockRelease).toBeDefined());
  await act(async () => {
    await expect(result.current.create.submit(request)).rejects.toMatchObject({
      name: 'AlreadySending',
    });
  });
  await act(async () => {
    mockRelease!();
    await first;
  });
  expect(mockKeys).toHaveLength(1);
  const saved = allMockOrders()[0]!;
  const cached = queryClient.getQueryData<Cached<ManualOrderCreateResult['order']>>(
    queryKeys.order({ workspace: 'platform', locale: 'en' }, saved.id)
  );
  expect(cached?.data.id).toBe(saved.id);
  expect(cached?.data.paymentStatus).toBe('pending');
});

it('locks changed payloads after an uncertain creation and recovers one order using reads', async () => {
  const { result, request } = await ready();
  const before = allMockOrders().length;
  mockUnknown = true;
  await act(async () => {
    await expect(result.current.create.submit(request)).rejects.toBeInstanceOf(CreationUnconfirmed);
  });
  const key = result.current.create.operationKey!;
  await act(async () => {
    await expect(
      result.current.create.submit({ ...request, draft: { ...draft, notes: 'Changed' } })
    ).rejects.toBeInstanceOf(CreationUnconfirmed);
  });
  await act(async () => {
    const recovered = await result.current.create.recover(key, request);
    expect(recovered.result?.order.lines[0]?.quantity).toBe(2);
  });
  expect(mockKeys).toHaveLength(1);
  expect(allMockOrders()).toHaveLength(before + 1);
  expect(allMockProducts().find((item) => item.id === 'prod_vase')!.stock.loc_main!.available).toBe(
    16
  );
});

it('a same-payload retry retains its original key and records one stock effect', async () => {
  const { result, request } = await ready();
  mockUnknown = true;
  await act(async () => {
    await result.current.create.submit(request).catch(() => undefined);
  });
  await act(() => result.current.create.submit(request));
  expect(mockKeys).toHaveLength(2);
  expect(new Set(mockKeys).size).toBe(1);
  expect(allMockProducts().find((item) => item.id === 'prod_vase')!.stock.loc_main!.available).toBe(
    16
  );
});

it('frees a creation the store has no record of, and sends the same request again with its key', async () => {
  const { result, request } = await ready();
  const before = allMockOrders().length;
  mockFaults = 3;
  await act(async () => {
    await expect(result.current.create.submit(request)).rejects.toMatchObject({ status: 503 });
  });
  expect(result.current.create.unsettled()).toBe(true);
  const key = result.current.create.original()!.key;
  await act(async () => {
    expect((await result.current.create.recover(key, request)).operation).toBeNull();
  });
  expect(result.current.create.unsettled()).toBe(false);
  await act(() => result.current.create.submit(request));
  expect(mockKeys).toHaveLength(4);
  expect(new Set(mockKeys)).toEqual(new Set([key]));
  expect(allMockOrders()).toHaveLength(before + 1);
});

it('a refusal before the key with no unanswered try is final; after one, it is not', async () => {
  const { result, request } = await ready();
  mockRefusal = { status: 403, code: 'AUTHORIZATION_ERROR', reason: 'CUSTOMER_NOT_ALLOWED' };
  await act(async () => {
    await expect(result.current.create.submit(request)).rejects.toMatchObject({ status: 403 });
  });
  expect(result.current.create.unsettled()).toBe(false);
  // Nothing holds the draft: a changed request goes to the store, which judges its quote.
  await act(async () => {
    await expect(
      result.current.create.submit({ ...request, draft: { ...draft, notes: 'Changed' } })
    ).rejects.toMatchObject({ reason: 'QUOTE_CHANGED' });
  });
  // A try with no answer, then the same refusal: that try may have been made.
  mockFaults = 1;
  mockRefusal = { status: 403, code: 'AUTHORIZATION_ERROR', reason: 'CUSTOMER_NOT_ALLOWED' };
  await act(async () => {
    await expect(result.current.create.submit(request)).rejects.toMatchObject({ status: 403 });
  });
  expect(result.current.create.unsettled()).toBe(true);
});

it('finishes a confirmed creation the operator may not read without its order', async () => {
  const { result, request } = await ready();
  mockUnknown = true;
  await act(async () => {
    await result.current.create.submit(request).catch(() => undefined);
  });
  const key = result.current.create.operationKey!;
  const account = [...state.sessions.values()].find((item) => item.email === 'admin@example.com')!;
  const grant = account.grants.find((item) => item.workspace === 'platform')!;
  const original = grant.capabilities;
  grant.capabilities = original.filter((capability) => capability !== 'VIEW_ORDERS');
  restoreGrant = () => {
    grant.capabilities = original;
  };
  await act(async () => {
    const recovered = await result.current.create.recover(key, request);
    expect(recovered.operation?.state).toBe('succeeded');
    expect(recovered.result).toBeUndefined();
  });
  expect(result.current.create.unsettled()).toBe(false);
  expect(
    queryClient.getQueryData(queryKeys.operation({ workspace: 'platform', locale: 'en' }, key))
  ).toMatchObject({ state: 'succeeded' });
  expect(mockKeys).toHaveLength(1);
});

it('recovers an uncertain order after reopening the hook without sending another creation', async () => {
  const original = await ready();
  mockUnknown = true;
  await act(async () => {
    await original.result.current.create.submit(original.request).catch(() => undefined);
  });
  const key = original.result.current.create.operationKey!;
  await original.unmount();
  const reopened = await renderAppHook(() => useCreateManualOrder(draft.draftId));
  await act(async () => {
    expect((await reopened.result.current.recover(key, original.request)).result?.order.id).toBe(
      allMockOrders()[0]!.id
    );
  });
  expect(mockKeys).toHaveLength(1);
});

it('recovers guest contact creation through its authorized selector without duplicating the contact', async () => {
  const { result } = await ready();
  const request = { name: 'Contact from mobile', email: 'contact.mobile@example.com' };
  mockUnknown = true;
  await act(async () => {
    await result.current.contact.submit(request).catch(() => undefined);
  });
  const key = result.current.contact.operationKey!;
  await act(async () => {
    const recovered = await result.current.contact.recover(key, request);
    expect(recovered.result?.customer.email).toBe(request.email);
  });
  expect(mockKeys).toHaveLength(1);
  expect(allMockOrderContacts().filter((contact) => contact.email === request.email)).toHaveLength(
    1
  );
});

it('abandons a late order response on sign-out without publishing private data', async () => {
  const { result, request } = await ready();
  mockHold = true;
  let outcome: unknown;
  let pending: Promise<unknown> | undefined;
  await act(async () => {
    pending = result.current.create.submit(request).catch((error) => {
      outcome = error;
    });
    await Promise.resolve();
  });
  await waitFor(() => expect(mockRelease).toBeDefined());
  await act(async () => {
    await authClient.signOut();
  });
  await act(async () => {
    mockRelease!();
    await pending;
  });
  expect(outcome).toBeInstanceOf(CreationScopeChanged);
  expect(
    queryClient.getQueryData(
      queryKeys.order({ workspace: 'platform', locale: 'en' }, allMockOrders()[0]!.id)
    )
  ).toBeUndefined();
});

it('a workspace switch cannot publish the original order in either workspace', async () => {
  await signInAs('both@example.com');
  const account = [...state.sessions.values()].find((item) => item.email === 'both@example.com')!;
  const grant = account.grants.find((item) => item.workspace === 'platform')!;
  const original = grant.capabilities;
  grant.capabilities = [...original, 'CREATE_ORDERS'];
  restoreGrant = () => {
    grant.capabilities = original;
  };
  const hook = await renderAppHook(() => ({
    create: useCreateManualOrder(draft.draftId),
    workspace: useWorkspace(),
  }));
  await waitFor(() => expect(hook.result.current.workspace.status).toBe('choose'));
  await act(() => hook.result.current.workspace.chooseWorkspace('platform'));
  const quote = await act(() => quoteOrder({ workspace: 'platform', locale: 'en' }, draft));
  mockHold = true;
  let outcome: unknown;
  let pending: Promise<unknown> | undefined;
  await act(async () => {
    pending = hook.result.current.create
      .submit({ draft, quoteToken: quote.token })
      .catch((error) => {
        outcome = error;
      });
    await Promise.resolve();
  });
  await waitFor(() => expect(mockRelease).toBeDefined());
  await act(() => hook.result.current.workspace.chooseWorkspace('vendor'));
  await act(async () => {
    mockRelease!();
    await pending;
  });
  expect(outcome).toBeInstanceOf(CreationScopeChanged);
  expect(hook.result.current.create.operationKey).toBeNull();
  for (const workspace of ['platform', 'vendor'] as const)
    expect(
      queryClient.getQueryData(queryKeys.order({ workspace, locale: 'en' }, allMockOrders()[0]!.id))
    ).toBeUndefined();
});
