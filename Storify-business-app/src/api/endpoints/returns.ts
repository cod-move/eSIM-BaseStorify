import {
  ReturnList,
  ReturnCase,
  ReturnOptions,
  ReturnPreview,
  ReturnCreateResult,
  ReturnActionResult,
  RefundPreview,
  RefundResult,
  BizUploadAccess,
  type ReturnListQuery,
  type ReturnPreviewRequest,
  type ReturnCreateRequest,
  type ReturnActionRequest,
  type RefundPreviewRequest,
  type RefundExecuteRequest,
} from '@/contracts/mobile/biz/v1';
import { api } from '../api';
import type { WorkspaceScope } from '../scope';

export const getReturns = (scope: WorkspaceScope, query: ReturnListQuery, signal?: AbortSignal) =>
  api.data({ ...scope, path: '/returns', query, signal }, ReturnList);
export const getReturn = (scope: WorkspaceScope, id: string, signal?: AbortSignal) =>
  api.data({ ...scope, path: `/returns/${encodeURIComponent(id)}`, signal }, ReturnCase);
export const getReturnOptions = (scope: WorkspaceScope, orderId: string, signal?: AbortSignal) =>
  api.data({ ...scope, path: '/returns/options', query: { orderId }, signal }, ReturnOptions);
export const previewReturn = (
  scope: WorkspaceScope,
  body: ReturnPreviewRequest,
  signal?: AbortSignal
) => api.data({ ...scope, path: '/returns/preview', method: 'POST', body, signal }, ReturnPreview);
export const createReturn = (
  scope: WorkspaceScope,
  body: ReturnCreateRequest,
  idempotencyKey: string,
  signal?: AbortSignal
) =>
  api.data(
    { ...scope, path: '/returns', method: 'POST', body, idempotencyKey, signal },
    ReturnCreateResult
  );
export const actOnReturn = (
  scope: WorkspaceScope,
  id: string,
  body: ReturnActionRequest,
  idempotencyKey: string,
  signal?: AbortSignal
) =>
  api.data(
    {
      ...scope,
      path: `/returns/${encodeURIComponent(id)}/actions`,
      method: 'POST',
      body,
      idempotencyKey,
      signal,
    },
    ReturnActionResult
  );
export const previewRefund = (
  scope: WorkspaceScope,
  body: RefundPreviewRequest,
  signal?: AbortSignal
) => api.data({ ...scope, path: '/refunds/preview', method: 'POST', body, signal }, RefundPreview);
export const executeRefund = (
  scope: WorkspaceScope,
  body: RefundExecuteRequest,
  idempotencyKey: string,
  signal?: AbortSignal
) =>
  api.data(
    { ...scope, path: '/refunds/execute', method: 'POST', body, idempotencyKey, signal },
    RefundResult
  );
export const getRefund = (scope: WorkspaceScope, id: string, signal?: AbortSignal) =>
  api.data({ ...scope, path: `/refunds/${encodeURIComponent(id)}`, signal }, RefundResult);
export const getReturnAttachment = (
  scope: WorkspaceScope,
  id: string,
  uploadId?: string,
  signal?: AbortSignal
) =>
  api.data(
    {
      ...scope,
      path: `/returns/${encodeURIComponent(id)}/${uploadId ? `evidence/${encodeURIComponent(uploadId)}` : 'label'}`,
      signal,
    },
    BizUploadAccess
  );
