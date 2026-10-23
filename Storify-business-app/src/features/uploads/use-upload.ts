import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect, useRef, useState } from 'react';

import { getOperation } from '@/api/endpoints/operations';
import { getUpload, getUploadAccess, uploadFile } from '@/api/endpoints/uploads';
import { isApiError, isNetworkError, type ApiError } from '@/api/errors';
import { AlreadySending, useKeyedMutation } from '@/api/keyed-mutation';
import { queryKeys } from '@/api/query-keys';
import type { WorkspaceScope } from '@/api/scope';
import {
  OperationStatus,
  type BizUpload,
  type BizUploadRequest,
  type BizUploadResult,
} from '@/contracts/mobile/biz/v1';
import { useSession } from '@/features/auth/use-session';
import { useWorkspaceScope } from '@/features/workspace/use-workspace';

import type { SelectedUploadFile } from './selected-file';

export class UploadCancelled extends Error {
  constructor() {
    super('Upload cancelled; its server outcome still needs confirmation');
    this.name = 'UploadCancelled';
  }
}

export class UploadScopeChanged extends Error {
  constructor() {
    super('The upload belongs to another session or workspace');
    this.name = 'UploadScopeChanged';
  }
}

/** A pending 409 answers the request without confirming whether its write succeeded. */
export class UploadOutcomeUnconfirmed extends Error {
  constructor(
    readonly operation: OperationStatus,
    readonly refusal: ApiError
  ) {
    super('The upload outcome needs reconciliation', { cause: refusal });
    this.name = 'UploadOutcomeUnconfirmed';
  }
}

type UploadSubmission = {
  request: BizUploadRequest;
  file: SelectedUploadFile;
  scope: WorkspaceScope;
  actorId: string;
};
type Attempt = UploadSubmission & { key: string };
type UploadJob = {
  /** `notReceived`: the store has no record of the upload's key, so nothing was stored. */
  phase:
    | 'idle'
    | 'sending'
    | 'cancelled'
    | 'unknown'
    | 'reconciling'
    | 'notReceived'
    | 'uploaded'
    | 'failed';
  selectionId?: string;
  key?: string;
  upload?: BizUpload;
  operation?: OperationStatus;
  error?: unknown;
};

export function useUpload(id: string | null) {
  const scope = useWorkspaceScope();
  return useQuery({
    queryKey: queryKeys.upload(scope, id ?? ''),
    queryFn: scope && id ? ({ signal }) => getUpload(scope, id, signal) : skipToken,
  });
}

/** Expiring private access is held only while observed and refreshed on every mount. */
export function useUploadAccess(id: string | null) {
  const scope = useWorkspaceScope();
  return useQuery({
    queryKey: queryKeys.uploadAccess(scope, id ?? ''),
    queryFn: scope && id ? ({ signal }) => getUploadAccess(scope, id, signal) : skipToken,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: (query) => {
      if (!query.state.data || query.state.error) return false;
      const expiresAt = Date.parse(query.state.data.expiresAt);
      return Number.isFinite(expiresAt) ? Math.max(1000, expiresAt - Date.now() - 5000) : false;
    },
  });
}

/** One selected file, one keyed tap. Cancel stops transport, never claims server rollback. */
export function useUploadFile() {
  const scope = useWorkspaceScope();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const identity = useRef({ actorId: user?.id, workspace: scope?.workspace });
  const controller = useRef<AbortController | null>(null);
  const running = useRef(false);
  const mounted = useRef(false);
  const attempt = useRef<Attempt | null>(null);
  const [status, setStatus] = useState<{
    job: UploadJob;
    owner?: { actorId: string; workspace: WorkspaceScope['workspace'] };
  }>({ job: { phase: 'idle' } });
  const setJob = (sent: UploadSubmission, job: UploadJob) =>
    setStatus({ job, owner: { actorId: sent.actorId, workspace: sent.scope.workspace } });

  const belongsHere = (sent: UploadSubmission) =>
    mounted.current &&
    identity.current.actorId === sent.actorId &&
    identity.current.workspace === sent.scope.workspace;

  useLayoutEffect(() => {
    mounted.current = true;
    identity.current = { actorId: user?.id, workspace: scope?.workspace };
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, [user?.id, scope?.workspace]);

  const mutation = useKeyedMutation<UploadSubmission, BizUploadResult>({
    attemptKey: (sent) => ['upload', sent.actorId, sent.scope.workspace, sent.file.selectionId],
    send: async (sent, key) => {
      if (!belongsHere(sent)) throw new UploadScopeChanged();
      const active = controller.current;
      if (!active || active.signal.aborted) throw new UploadCancelled();
      attempt.current = { ...sent, key };
      setJob(sent, { phase: 'sending', selectionId: sent.file.selectionId, key });
      try {
        return await uploadFile(
          sent.scope,
          sent.request,
          sent.file.blob,
          sent.file.filename,
          key,
          active.signal
        );
      } catch (error) {
        if (active.signal.aborted) throw new UploadCancelled();
        if (isApiError(error) && error.status < 500 && error.code !== 'REQUEST_IN_PROGRESS') {
          const operation = OperationStatus.safeParse(error.details?.operation);
          if (operation.success && ['pending', 'unknown'].includes(operation.data.state))
            throw new UploadOutcomeUnconfirmed(operation.data, error);
        }
        throw error;
      }
    },
    onSuccess: (result, sent) => {
      if (!belongsHere(sent)) return;
      queryClient.setQueryData(queryKeys.upload(sent.scope, result.upload.id), result.upload);
      queryClient.setQueryData(
        queryKeys.operation(sent.scope, result.operation.key),
        result.operation
      );
      setJob(sent, {
        phase: 'uploaded',
        selectionId: sent.file.selectionId,
        key: result.operation.key,
        ...result,
      });
    },
    onError: (error, sent) => {
      if (!belongsHere(sent)) return;
      const key =
        attempt.current?.file.selectionId === sent.file.selectionId
          ? attempt.current.key
          : undefined;
      const described = OperationStatus.safeParse(
        isApiError(error) ? error.details?.operation : undefined
      );
      const operation =
        error instanceof UploadOutcomeUnconfirmed
          ? error.operation
          : described.success
            ? described.data
            : undefined;
      setJob(sent, {
        phase:
          error instanceof UploadCancelled
            ? 'cancelled'
            : key &&
                (isNetworkError(error) ||
                  error instanceof UploadOutcomeUnconfirmed ||
                  (operation && ['pending', 'unknown'].includes(operation.state)) ||
                  (isApiError(error) &&
                    ['OPERATION_OUTCOME_UNKNOWN', 'OPERATION_RECONCILIATION_REQUIRED'].includes(
                      error.reason ?? ''
                    )))
              ? 'unknown'
              : 'failed',
        selectionId: sent.file.selectionId,
        key,
        error,
        ...(operation ? { operation } : {}),
      });
    },
  });

  const submit = (request: BizUploadRequest, file: SelectedUploadFile) => {
    if (!scope || !user) return Promise.reject(new UploadScopeChanged());
    if (running.current) return Promise.reject(new AlreadySending());
    running.current = true;
    controller.current = new AbortController();
    // A language change must not make an unanswered upload into another tap.
    const previous = attempt.current;
    const sentScope =
      previous &&
      belongsHere(previous) &&
      previous.file.selectionId === file.selectionId &&
      JSON.stringify(previous.request) === JSON.stringify(request)
        ? previous.scope
        : scope;
    return mutation.submit({ request, file, scope: sentScope, actorId: user.id }).finally(() => {
      running.current = false;
    });
  };

  const cancel = () => controller.current?.abort();
  const reconcile = async () => {
    const sent = attempt.current;
    if (!sent || !belongsHere(sent)) throw new UploadScopeChanged();
    if (running.current) throw new AlreadySending();
    running.current = true;
    const active = new AbortController();
    controller.current = active;
    setJob(sent, { phase: 'reconciling', selectionId: sent.file.selectionId, key: sent.key });
    try {
      const operation = await getOperation(sent.scope, sent.key, active.signal);
      const resource = operation.resources.find((resource) => resource.kind === 'upload');
      const upload =
        operation.state === 'succeeded' && resource
          ? await getUpload(sent.scope, resource.id, active.signal)
          : undefined;
      if (!belongsHere(sent)) throw new UploadScopeChanged();
      queryClient.setQueryData(queryKeys.operation(sent.scope, sent.key), operation);
      if (upload) queryClient.setQueryData(queryKeys.upload(sent.scope, upload.id), upload);
      setJob(sent, {
        phase: upload ? 'uploaded' : operation.state === 'failed' ? 'failed' : 'unknown',
        selectionId: sent.file.selectionId,
        key: sent.key,
        operation,
        upload,
      });
      return { operation, upload };
    } catch (error) {
      // No record under the key: the upload never reached the store's write, and
      // nothing was stored. The same file may be sent again, or let go.
      if (isApiError(error) && error.status === 404 && error.code === 'NOT_FOUND') {
        if (belongsHere(sent))
          setJob(sent, {
            phase: 'notReceived',
            selectionId: sent.file.selectionId,
            key: sent.key,
          });
        return { operation: undefined, upload: undefined };
      }
      const refusal = active.signal.aborted ? new UploadCancelled() : error;
      if (belongsHere(sent))
        setJob(sent, {
          phase: active.signal.aborted ? 'cancelled' : 'unknown',
          selectionId: sent.file.selectionId,
          key: sent.key,
          error: refusal,
        });
      throw refusal;
    } finally {
      running.current = false;
    }
  };

  /**
   * Lets the upload go: the editor stops waiting for it and it is not added to
   * the product. One the store did store stays unattached, as a file nobody uses.
   */
  const discard = () => {
    if (running.current) return;
    attempt.current = null;
    setStatus({ job: { phase: 'idle' } });
  };

  return {
    submit,
    cancel,
    reconcile,
    discard,
    job:
      status.owner &&
      (status.owner.actorId !== user?.id || status.owner.workspace !== scope?.workspace)
        ? { phase: 'idle' as const }
        : status.job,
    isPending: mutation.isPending,
  };
}
