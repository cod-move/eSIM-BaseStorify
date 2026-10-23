import {
  BizUpload,
  BizUploadAccess,
  BizUploadResult,
  type BizUploadRequest,
} from '@/contracts/mobile/biz/v1';

import { api } from '../api';
import type { WorkspaceScope } from '../scope';

/** Actual Blob/File bytes; the transport supplies the multipart boundary. */
export function uploadFile(
  { locale, workspace }: WorkspaceScope,
  request: BizUploadRequest,
  file: Blob,
  filename: string,
  idempotencyKey: string,
  signal?: AbortSignal
) {
  const multipartBody = new FormData();
  multipartBody.append('purpose', request.purpose);
  multipartBody.append('target', JSON.stringify(request.target));
  multipartBody.append('file', file, filename);
  return api.data(
    { locale, workspace, path: '/uploads', method: 'POST', multipartBody, idempotencyKey, signal },
    BizUploadResult
  );
}

export function getUpload({ locale, workspace }: WorkspaceScope, id: string, signal?: AbortSignal) {
  return api.data(
    { locale, workspace, path: `/uploads/${encodeURIComponent(id)}`, signal },
    BizUpload
  );
}

/** Private URLs are refreshed through current target access, never persisted. */
export function getUploadAccess(
  { locale, workspace }: WorkspaceScope,
  id: string,
  signal?: AbortSignal
) {
  return api.data(
    { locale, workspace, path: `/uploads/${encodeURIComponent(id)}/access`, signal },
    BizUploadAccess
  );
}
