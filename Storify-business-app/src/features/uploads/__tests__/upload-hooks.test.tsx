import { onlineManager } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react-native';

import { renderAppHook, signInAs } from '@/__tests__/hooks';
import { isNetworkError } from '@/api/errors';
import { changeMockOperation } from '@/api/mocks/routes/operations';
import { storedMockUploadCount } from '@/api/mocks/routes/uploads';
import { loseNextAnswer } from '@/api/mocks/server';
import { queryClient } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import type { BizUploadRequest, UploadPolicy } from '@/contracts/mobile/biz/v1';
import { useWorkspace } from '@/features/workspace/use-workspace';

import { selectedUploadFile } from '../selected-file';
import { useOperationStatus } from '../use-operation-status';
import { UploadCancelled, UploadOutcomeUnconfirmed, useUploadFile } from '../use-upload';

const mockUploadKeys: string[] = [];
let mockHoldUpload = false;
let mockPendingUpload = false;
let mockTemporaryUpload: { remaining: number; state: 'pending' | 'unknown' } | null = null;
let mockOperationReads = 0;

jest.mock('@/api/transport', () => ({
  transport: async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const server = jest.requireActual('@/api/mocks/server') as typeof import('@/api/mocks/server');
    const url = String(input);
    if (url.includes('/operations?')) mockOperationReads += 1;
    const upload = init?.method === 'POST' && url.endsWith('/uploads');
    if (upload) mockUploadKeys.push(new Headers(init.headers).get('idempotency-key') ?? '');
    const response = await server.mockFetch(input, init);
    if (upload && mockTemporaryUpload && mockTemporaryUpload.remaining > 0) {
      mockTemporaryUpload.remaining -= 1;
      const { state } = mockTemporaryUpload;
      const result = await response.json();
      return new Response(
        JSON.stringify({
          success: false,
          code: state === 'pending' ? 'REQUEST_IN_PROGRESS' : 'SERVICE_UNAVAILABLE',
          ...(state === 'unknown' ? { reason: 'OPERATION_OUTCOME_UNKNOWN' } : {}),
          details: { operation: { ...result.data.operation, state, retryAfterSeconds: 2 } },
        }),
        { status: state === 'pending' ? 409 : 503, headers: { 'Retry-After': '0' } }
      );
    }
    if (upload && mockPendingUpload) {
      mockPendingUpload = false;
      const result = await response.json();
      return new Response(
        JSON.stringify({
          success: false,
          code: 'CONFLICT',
          reason: 'OPERATION_RECONCILIATION_REQUIRED',
          details: {
            operation: { ...result.data.operation, state: 'pending', retryAfterSeconds: 2 },
          },
        }),
        { status: 409 }
      );
    }
    if (upload && mockHoldUpload) {
      await new Promise<never>((_resolve, reject) => {
        const abort = () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
        if (init?.signal?.aborted) abort();
        else init?.signal?.addEventListener('abort', abort, { once: true });
      });
    }
    return response;
  },
}));

const policy: UploadPolicy = {
  purpose: 'product_media',
  maxBytes: 100,
  maxFiles: 1,
  mimeTypes: ['image/jpeg'],
};
const request: BizUploadRequest = {
  purpose: 'product_media',
  target: { kind: 'product', id: 'prod_towel' },
};
const pick = () =>
  selectedUploadFile(new Blob(['photo'], { type: 'image/jpeg' }), 'photo.jpg', policy);

beforeEach(() => {
  mockUploadKeys.length = 0;
  mockHoldUpload = false;
  mockPendingUpload = false;
  mockTemporaryUpload = null;
  mockOperationReads = 0;
  onlineManager.setOnline(true);
});
afterEach(() => onlineManager.setOnline(true));

async function screen() {
  await signInAs('seller@example.com');
  const rendered = await renderAppHook(() => ({
    upload: useUploadFile(),
    workspace: useWorkspace(),
  }));
  await waitFor(() => expect(rendered.result.current.workspace.status).toBe('ready'));
  return rendered;
}

describe('keyed upload lifecycle', () => {
  it.each(['pending', 'unknown'] as const)(
    'keeps a canonical %s operation uncertain after exhausted retries and reuses its key',
    async (state) => {
      const { result } = await screen();
      const file = pick();
      mockTemporaryUpload = { remaining: 3, state };
      await act(async () => {
        await result.current.upload.submit(request, file).catch(() => undefined);
      });
      expect(mockUploadKeys).toHaveLength(3);
      expect(result.current.upload.job.phase).toBe('unknown');
      expect(result.current.upload.job.operation?.state).toBe(state);
      await act(() => result.current.upload.submit(request, file));
      expect(new Set(mockUploadKeys).size).toBe(1);
      expect(storedMockUploadCount()).toBe(1);
      expect(result.current.upload.job.phase).toBe('uploaded');
    }
  );

  it('retries lost answers with the original binary and key', async () => {
    const { result } = await screen();
    loseNextAnswer();
    await act(() => result.current.upload.submit(request, pick()));
    expect(mockUploadKeys).toHaveLength(2);
    expect(new Set(mockUploadKeys).size).toBe(1);
    expect(storedMockUploadCount()).toBe(1);
    expect(result.current.upload.job.phase).toBe('uploaded');
  });

  it('keeps a pending 409 key for a later retry instead of creating another upload', async () => {
    const { result } = await screen();
    const file = pick();
    mockPendingUpload = true;
    let error: unknown;
    await act(async () => {
      error = await result.current.upload.submit(request, file).catch((caught: unknown) => caught);
    });
    expect(error).toBeInstanceOf(UploadOutcomeUnconfirmed);
    expect(result.current.upload.job.phase).toBe('unknown');
    await act(() => result.current.upload.submit(request, file));
    expect(mockUploadKeys[1]).toBe(mockUploadKeys[0]);
    expect(storedMockUploadCount()).toBe(1);
  });

  it('cancels transport and reconciles a committed server operation without resending it', async () => {
    const { result } = await screen();
    mockHoldUpload = true;
    let pending: Promise<unknown> = Promise.resolve();
    await act(async () => {
      pending = result.current.upload.submit(request, pick()).catch((caught: unknown) => caught);
    });
    await waitFor(() => expect(storedMockUploadCount()).toBe(1));
    await act(async () => {
      result.current.upload.cancel();
      await pending;
    });
    expect(await pending).toBeInstanceOf(UploadCancelled);
    expect(result.current.upload.job.phase).toBe('cancelled');
    const key = result.current.upload.job.key;
    await act(() => result.current.upload.reconcile());
    expect(result.current.upload.job.phase).toBe('uploaded');
    expect(result.current.upload.job.operation?.key).toBe(key);
    expect(mockUploadKeys).toHaveLength(1);
  });

  it('does not send offline or queue a later upload when connectivity returns', async () => {
    const { result } = await screen();
    await act(async () => onlineManager.setOnline(false));
    let error: unknown;
    await act(async () => {
      error = await result.current.upload
        .submit(request, pick())
        .catch((caught: unknown) => caught);
    });
    expect(isNetworkError(error)).toBe(true);
    await act(async () => {
      onlineManager.setOnline(true);
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(mockUploadKeys).toHaveLength(0);
    expect(storedMockUploadCount()).toBe(0);
  });

  it('aborts on workspace switch and cannot expose the old workspace upload there', async () => {
    await signInAs('both@example.com');
    const { result } = await renderAppHook(() => ({
      upload: useUploadFile(),
      workspace: useWorkspace(),
    }));
    await waitFor(() => expect(result.current.workspace.status).toBe('choose'));
    await act(async () => result.current.workspace.chooseWorkspace('platform'));
    await waitFor(() => expect(result.current.workspace.status).toBe('ready'));
    // Hold the transport's answer to exercise scope cancellation regardless of the write grant.
    mockHoldUpload = true;
    let pending: Promise<unknown> = Promise.resolve();
    await act(async () => {
      pending = result.current.upload.submit(request, pick()).catch((caught: unknown) => caught);
    });
    await waitFor(() => expect(mockUploadKeys).toHaveLength(1));
    await act(async () => result.current.workspace.chooseWorkspace('vendor'));
    await act(async () => {
      await pending;
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(result.current.upload.job.phase).toBe('idle');
    expect(
      queryClient.getQueriesData({ queryKey: ['private', 'workspace', 'vendor', 'uploads'] })
    ).toHaveLength(0);
    await expect(result.current.upload.reconcile()).rejects.toThrow('another session or workspace');
  });
});

describe('generic operation polling', () => {
  it('polls the original key until the store confirms success, then stops', async () => {
    const { result } = await screen();
    await act(() => result.current.upload.submit(request, pick()));
    const key = result.current.upload.job.key!;
    changeMockOperation(key, (operation) => ({
      ...operation,
      state: 'pending',
      retryAfterSeconds: 1,
    }));
    queryClient.removeQueries({
      queryKey: queryKeys.operation({ workspace: 'vendor', locale: 'en' }, key),
    });
    const poll = await renderAppHook(() => useOperationStatus(key));
    await waitFor(() => expect(poll.result.current.data?.state).toBe('pending'));
    changeMockOperation(key, (operation) => ({ ...operation, state: 'succeeded' }));
    await waitFor(() => expect(poll.result.current.data?.state).toBe('succeeded'), {
      timeout: 2500,
    });
    const reads = mockOperationReads;
    await act(() => new Promise((resolve) => setTimeout(resolve, 1100)));
    expect(mockOperationReads).toBe(reads);
    expect(mockUploadKeys).toHaveLength(1);
  });
});
