import {
  onlineManager,
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useLayoutEffect, useRef, useState } from 'react';

import { getOperation } from '@/api/endpoints/operations';
import {
  createFullProduct,
  fullProductAction,
  generateProductVariants,
  getDigitalAssetAccess,
  getProductEditor,
  getProductFormOptions,
  saveFullProduct,
} from '@/api/endpoints/product-editor';
import { isFinal } from '@/api/attempt';
import { isApiError, NetworkError } from '@/api/errors';
import { AlreadySending, useKeyedMutation } from '@/api/keyed-mutation';
import { showAnswer } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import type { WorkspaceScope } from '@/api/scope';
import {
  OperationStatus,
  ProductEditorDetail,
  type ProductCreateRequest,
  type ProductEditorActionRequest,
  type ProductEditorResult,
  type ProductSaveRequest,
  type ProductVariantGenerateRequest,
} from '@/contracts/mobile/biz/v1';
import { useSession } from '@/features/auth/use-session';
import { useWorkspaceScope } from '@/features/workspace/use-workspace';

import {
  checkProductEditorChange,
  editorFingerprint,
  ProductEditorConflict,
} from './product-editor-conflict';

export { ProductEditorConflict } from './product-editor-conflict';

export class ProductEditorScopeChanged extends Error {
  constructor() {
    super('Open the original account and workspace for this product change');
    this.name = 'ProductEditorScopeChanged';
  }
}

export class ProductEditorUnconfirmed extends Error {
  constructor(
    readonly key: string,
    readonly operation?: OperationStatus,
    cause?: unknown
  ) {
    super('Check the original product change before submitting another payload', { cause });
    this.name = 'ProductEditorUnconfirmed';
  }
}

/**
 * The store has no record of a change the app was unsure of: it never reached
 * the store's write (the connection dropped on the way, or the store refused
 * it before writing), so nothing was saved and the draft may be sent again.
 */
export class ProductEditorNotReceived extends Error {
  constructor(readonly key: string) {
    super('The store has no record of this product change: nothing was saved');
    this.name = 'ProductEditorNotReceived';
  }
}

type EditorIntent =
  | { kind: 'create'; request: ProductCreateRequest }
  | { kind: 'save'; id: string; request: ProductSaveRequest; base: ProductEditorDetail }
  | { kind: 'action'; id: string; request: ProductEditorActionRequest; version: string };
type Sent = { intent: EditorIntent; scope: WorkspaceScope; actorId: string; revision: number };
type SentAttempt = Sent & { key: string };

/**
 * Changes sent without a confirmed outcome, by their `Idempotency-Key`. They
 * outlive the editor that sent them, as its draft does: an operator who leaves
 * and comes back can send the very same change again (same key, same body),
 * which is what settles it on the store. Only the key the draft holds finds one.
 */
const held = new Map<string, SentAttempt>();
const targetOf = (intent: EditorIntent) =>
  intent.kind === 'create' ? intent.request.draftId : intent.id;
const payloadOf = (intent: EditorIntent) => ({
  request: intent.request,
  version:
    intent.kind === 'save'
      ? intent.base.version
      : intent.kind === 'action'
        ? intent.version
        : undefined,
});

export function useProductEditor(id: string | null) {
  const scope = useWorkspaceScope();
  return useQuery({
    queryKey: queryKeys.productEditor(scope, id ?? ''),
    queryFn: scope && id ? ({ signal }) => getProductEditor(scope, id, signal) : skipToken,
  });
}

export function useProductFormOptions(id: string | null) {
  const scope = useWorkspaceScope();
  return useQuery({
    queryKey: queryKeys.productFormOptions(scope, id),
    queryFn: scope ? ({ signal }) => getProductFormOptions(scope, id, signal) : skipToken,
  });
}

export function useDigitalAssetAccess(id: string, assetId: string | null) {
  const scope = useWorkspaceScope();
  return useQuery({
    queryKey: queryKeys.digitalAssetAccess(scope, id, assetId ?? ''),
    queryFn:
      scope && assetId
        ? ({ signal }) => getDigitalAssetAccess(scope, id, assetId, signal)
        : skipToken,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: (query) =>
      query.state.data && !query.state.error
        ? Math.max(1000, Date.parse(query.state.data.expiresAt) - Date.now() - 5000)
        : false,
  });
}

function useProductWrite(kind: EditorIntent['kind'], id: string | null) {
  const scope = useWorkspaceScope();
  const { user } = useSession();
  const client = useQueryClient();
  const identity = useRef({ actorId: user?.id, workspace: scope?.workspace, id, kind });
  const mounted = useRef(false);
  const active = useRef<AbortController | null>(null);
  const running = useRef(false);
  const revision = useRef(0);
  const last = useRef<SentAttempt | null>(null);
  /** The attempt with no answer: only the same change may go next, with its key. */
  const uncertain = useRef<SentAttempt | null>(null);
  const hold = (attempt: SentAttempt) => {
    uncertain.current = attempt;
    held.set(attempt.key, attempt);
  };
  /** The store answered for `key` (or has no record of it): the attempt is over. */
  const release = (key: string | undefined) => {
    if (!key) return;
    held.delete(key);
    if (uncertain.current?.key === key) uncertain.current = null;
  };
  const [status, setStatus] = useState<{
    owner?: { actorId: string; workspace: WorkspaceScope['workspace']; id: string | null };
    key: string | null;
    operation?: OperationStatus;
    recovering: boolean;
  }>({ key: null, recovering: false });
  const here = (sent: Sent) =>
    mounted.current &&
    identity.current.actorId === sent.actorId &&
    identity.current.workspace === sent.scope.workspace &&
    identity.current.kind === sent.intent.kind &&
    (sent.intent.kind === 'create' || identity.current.id === sent.intent.id);
  const statusOf = (
    sent: Sent,
    key: string | null,
    operation?: OperationStatus,
    recovering = false
  ) => {
    if (here(sent))
      setStatus({
        owner: {
          actorId: sent.actorId,
          workspace: sent.scope.workspace,
          id: sent.intent.kind === 'create' ? null : sent.intent.id,
        },
        key,
        operation,
        recovering,
      });
  };
  useLayoutEffect(() => {
    mounted.current = true;
    identity.current = { actorId: user?.id, workspace: scope?.workspace, id, kind };
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, [user?.id, scope?.workspace, id, kind]);

  const publish = async (result: ProductEditorResult, sent: Sent) => {
    if (!here(sent)) throw new ProductEditorScopeChanged();
    if (result.product) {
      await showAnswer(
        client,
        queryKeys.productEditor(sent.scope, result.product.id),
        result.product
      );
      if (!here(sent)) throw new ProductEditorScopeChanged();
      await showAnswer(
        client,
        queryKeys.product(sent.scope, result.product.id),
        result.product.product
      );
      void client.invalidateQueries({
        queryKey: queryKeys.productStock(sent.scope, result.product.id),
      });
      void client.invalidateQueries({
        queryKey: queryKeys.productFormOptions(sent.scope, result.product.id),
      });
    } else if (result.deleted && sent.intent.kind !== 'create') {
      client.removeQueries({ queryKey: queryKeys.productEditor(sent.scope, sent.intent.id) });
      client.removeQueries({ queryKey: queryKeys.product(sent.scope, sent.intent.id) });
      client.removeQueries({ queryKey: queryKeys.productStock(sent.scope, sent.intent.id) });
    }
    if (!here(sent)) throw new ProductEditorScopeChanged();
    client.setQueryData(queryKeys.operation(sent.scope, result.operation.key), result.operation);
    statusOf(sent, result.operation.key, result.operation);
    void client.invalidateQueries({ queryKey: queryKeys.productLists(sent.scope) });
    void client.invalidateQueries({ queryKey: queryKeys.home(sent.scope) });
    void client.invalidateQueries({ queryKey: queryKeys.productFormOptions(sent.scope, null) });
    return result;
  };

  const mutation = useKeyedMutation<Sent, ProductEditorResult>({
    attemptKey: (sent) => [
      'product-editor',
      sent.actorId,
      sent.scope.workspace,
      sent.intent.kind,
      targetOf(sent.intent),
    ],
    send: async (sent, key) => {
      if (!here(sent)) throw new ProductEditorScopeChanged();
      const controller = active.current;
      if (!controller || controller.signal.aborted) throw new ProductEditorScopeChanged();
      last.current = { ...sent, key };
      statusOf(sent, key);
      try {
        const intent = sent.intent;
        const result =
          intent.kind === 'create'
            ? await createFullProduct(sent.scope, intent.request, key, controller.signal)
            : intent.kind === 'save'
              ? await saveFullProduct(
                  sent.scope,
                  intent.id,
                  intent.request,
                  intent.base.version,
                  key,
                  controller.signal
                )
              : await fullProductAction(
                  sent.scope,
                  intent.id,
                  intent.request,
                  intent.version,
                  key,
                  controller.signal
                );
        if (!here(sent)) throw new ProductEditorScopeChanged();
        if (result.operation.state === 'pending' || result.operation.state === 'unknown') {
          throw new ProductEditorUnconfirmed(key, result.operation);
        }
        return result;
      } catch (error) {
        const described = OperationStatus.safeParse(
          isApiError(error) ? error.details?.operation : undefined
        );
        if (
          described.success &&
          ['pending', 'unknown'].includes(described.data.state) &&
          isApiError(error) &&
          error.status < 500 &&
          error.code !== 'REQUEST_IN_PROGRESS'
        )
          throw new ProductEditorUnconfirmed(key, described.data, error);
        throw error;
      }
    },
    onSuccess: async (result, sent) => {
      release(uncertain.current?.key);
      release(last.current?.key);
      if (here(sent)) await publish(result, sent);
    },
    onError: (error, sent) => {
      const attempt = last.current;
      if (
        !attempt ||
        !here(sent) ||
        attempt.actorId !== sent.actorId ||
        targetOf(attempt.intent) !== targetOf(sent.intent)
      )
        return;
      const described = OperationStatus.safeParse(
        isApiError(error) ? error.details?.operation : undefined
      );
      const operation =
        error instanceof ProductEditorUnconfirmed
          ? error.operation
          : described.success
            ? described.data
            : undefined;
      if (isFinal(error)) release(attempt.key);
      else hold(attempt);
      statusOf(sent, attempt.key, operation);
    },
  });

  const submit = async (intent: EditorIntent): Promise<ProductEditorResult> => {
    if (!scope || !user) throw new ProductEditorScopeChanged();
    if (running.current) throw new AlreadySending();
    const pending = uncertain.current;
    if (
      pending &&
      here(pending) &&
      editorFingerprint(payloadOf(pending.intent)) !== editorFingerprint(payloadOf(intent))
    )
      throw new ProductEditorUnconfirmed(pending.key);
    const sent =
      pending && here(pending)
        ? {
            intent: pending.intent,
            scope: pending.scope,
            actorId: pending.actorId,
            revision: pending.revision,
          }
        : { intent, scope, actorId: user.id, revision: revision.current };
    if (!pending || !here(pending)) last.current = null;
    if (!onlineManager.isOnline()) throw new NetworkError('offline');
    running.current = true;
    active.current = new AbortController();
    try {
      return await mutation.submit(sent);
    } finally {
      running.current = false;
    }
  };

  /**
   * What was sent under `key` and never confirmed, made the open attempt again,
   * so the next submit sends exactly it: the same key, the same body. On the
   * store only that settles a change it could not confirm. Null when this
   * phone no longer holds it (another account, another workspace).
   */
  const unanswered = (key: string): EditorIntent | null => {
    const attempt = uncertain.current?.key === key ? uncertain.current : held.get(key);
    if (!attempt || !here(attempt)) return null;
    uncertain.current = attempt;
    last.current = attempt;
    return attempt.intent;
  };

  const recover = async (
    key: string,
    expectedAction?: ProductEditorActionRequest
  ): Promise<ProductEditorResult> => {
    if (!scope || !user) throw new ProductEditorScopeChanged();
    if (!onlineManager.isOnline()) throw new NetworkError('offline');
    if (running.current) throw new AlreadySending();
    const original = last.current?.key === key ? last.current : null;
    if (original && !here(original)) throw new ProductEditorScopeChanged();
    const sent: Sent = original ?? {
      scope,
      actorId: user.id,
      revision: revision.current,
      intent:
        kind === 'create'
          ? {
              kind: 'create',
              request: { draftId: key, values: {} as ProductCreateRequest['values'] },
            }
          : kind === 'save'
            ? {
                kind: 'save',
                id: id ?? '',
                request: { changes: {} },
                base: {} as ProductEditorDetail,
              }
            : { kind: 'action', id: id ?? '', request: { action: 'delete' }, version: '' },
    };
    running.current = true;
    const controller = new AbortController();
    active.current = controller;
    statusOf(sent, key, undefined, true);
    try {
      const operation = await getOperation(sent.scope, key, controller.signal).catch(
        (error: unknown) => {
          // No record under the key: the change never reached the store's write, and nothing
          // was saved. The attempt is over: the draft may be reviewed and sent again.
          if (isApiError(error) && error.status === 404 && error.code === 'NOT_FOUND') {
            release(key);
            throw new ProductEditorNotReceived(key);
          }
          throw error;
        }
      );
      if (!here(sent)) throw new ProductEditorScopeChanged();
      const resource = operation.resources.find((resource) => resource.kind === 'product');
      let result: ProductEditorResult = { operation };
      if (operation.state === 'succeeded' && resource) {
        if (
          (original?.intent.kind === 'action' && original.intent.request.action === 'delete') ||
          (kind === 'action' && expectedAction?.action === 'delete')
        )
          result = { operation, deleted: true };
        else
          result = {
            operation,
            product: await getProductEditor(sent.scope, resource.id, controller.signal),
          };
      }
      if (operation.state === 'failed') revision.current += 1;
      if (operation.state === 'failed' || operation.state === 'succeeded') release(key);
      return await publish(result, sent);
    } finally {
      running.current = false;
      if (here(sent)) setStatus((previous) => ({ ...previous, recovering: false }));
    }
  };

  const visible =
    !status.owner ||
    (status.owner.actorId === user?.id &&
      status.owner.workspace === scope?.workspace &&
      status.owner.id === id);
  /** Sends the change held under `key` again, exactly as it went (`unanswered`). */
  const resend = (
    key: string,
    send: (intent: EditorIntent) => Promise<ProductEditorResult> = submit
  ): Promise<ProductEditorResult> => {
    const intent = unanswered(key);
    return intent ? send(intent) : Promise.reject(new ProductEditorScopeChanged());
  };

  return {
    submit,
    resend,
    recover,
    operationKey: visible ? status.key : null,
    operation: visible ? status.operation : undefined,
    isRecovering: visible && status.recovering,
    isPending: mutation.isPending,
    publish,
    original: () => last.current,
    guard: here,
  };
}

export function useCreateFullProduct() {
  const write = useProductWrite('create', null);
  return {
    ...write,
    submit: (request: ProductCreateRequest) => write.submit({ kind: 'create', request }),
  };
}

export function useSaveFullProduct(id: string) {
  const write = useProductWrite('save', id);
  const client = useQueryClient();
  const submit = async ({
    request,
    base,
  }: {
    request: ProductSaveRequest;
    base: ProductEditorDetail;
  }): Promise<ProductEditorResult> => {
    if (base.id !== id) throw new ProductEditorScopeChanged();
    let currentBase = base;
    for (let rebase = 0; ; rebase += 1) {
      try {
        return await write.submit({ kind: 'save', id, request, base: currentBase });
      } catch (error) {
        if (!isApiError(error) || error.status !== 412) throw error;
        const original = write.original();
        if (!original || !write.guard(original)) throw new ProductEditorScopeChanged();
        const described = ProductEditorDetail.safeParse(error.details?.product);
        const current = described.success
          ? described.data
          : await getProductEditor(original.scope, id);
        if (!write.guard(original)) throw new ProductEditorScopeChanged();
        const check = checkProductEditorChange(request, currentBase, current);
        await showAnswer(client, queryKeys.productEditor(original.scope, id), current);
        if (check.state === 'conflict')
          throw new ProductEditorConflict(current, check.fields, request);
        if (check.state === 'applied')
          return write.publish(
            { operation: await getOperation(original.scope, original.key), product: current },
            original
          );
        if (rebase >= 1) throw error;
        currentBase = current;
      }
    }
  };
  return {
    ...write,
    submit,
    resend: (key: string) =>
      write.resend(key, (intent) =>
        intent.kind === 'save'
          ? submit({ request: intent.request, base: intent.base })
          : Promise.reject(new ProductEditorScopeChanged())
      ),
  };
}

export function useFullProductAction(id: string) {
  const write = useProductWrite('action', id);
  return {
    ...write,
    submit: ({ action, version }: { action: ProductEditorActionRequest; version: string }) =>
      write.submit({ kind: 'action', id, request: action, version }),
  };
}

export function useGenerateProductVariants() {
  const scope = useWorkspaceScope();
  const { user } = useSession();
  const identity = useRef({ actorId: user?.id, workspace: scope?.workspace });
  useLayoutEffect(() => {
    identity.current = { actorId: user?.id, workspace: scope?.workspace };
  }, [user?.id, scope?.workspace]);
  return useMutation({
    networkMode: 'always',
    retry: false,
    mutationFn: async (request: ProductVariantGenerateRequest) => {
      if (!scope || !user) throw new ProductEditorScopeChanged();
      if (!onlineManager.isOnline()) throw new NetworkError('offline');
      const result = await generateProductVariants(scope, request);
      if (identity.current.actorId !== user.id || identity.current.workspace !== scope.workspace)
        throw new ProductEditorScopeChanged();
      return result;
    },
  });
}
