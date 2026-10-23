import {
  BizUploadRequest,
  OperationQuery,
  type BizUpload,
  type BizUploadRequest as UploadRequest,
  type Capability,
  type UploadTarget,
} from '@/contracts/mobile/biz/v1';

import {
  MOCK_UPLOAD_POLICIES,
  seedUploadTargets,
  type MockUploadTarget,
} from '../fixtures/uploads';
import { MOCK_ORIGIN } from '../fixtures/shared';
import {
  accountOf,
  bodyOf,
  grantOf,
  invalid,
  MockError,
  requireCapability,
  type MockContext,
  type MockRoute,
} from '../kit';
import { scopeOf } from '../scope';
import { isMockMultipartFile, type MockMultipartFile } from '../multipart';
import { state } from '../state';

import { keepMockOperation } from './operations';

type StoredUpload = { upload: BizUpload; accountId: string; workspace: string };
let targets = seedUploadTargets();
const uploads = new Map<string, StoredUpload>();

export function reset(): void {
  targets = seedUploadTargets();
  uploads.clear();
}

export function registerMockUploadTarget(target: MockUploadTarget): void {
  targets = targets.filter(
    (entry) => entry.target.kind !== target.target.kind || entry.target.id !== target.target.id
  );
  targets.push(target);
}

export function removeMockUploadTarget(target: UploadTarget): void {
  targets = targets.filter(
    (entry) => entry.target.kind !== target.kind || entry.target.id !== target.id
  );
}

export function storedMockUploadCount(): number {
  return uploads.size;
}

/** Product leaves attach only uploads owned by their original draft or product. */
export function editorMockUpload(
  ctx: MockContext,
  id: string,
  target: UploadTarget,
  purpose: BizUpload['purpose']
): BizUpload {
  const held = uploads.get(id);
  if (
    !held ||
    held.workspace !== grantOf(ctx).workspace ||
    held.upload.purpose !== purpose ||
    held.upload.target.kind !== target.kind ||
    held.upload.target.id !== target.id ||
    (target.kind === 'product_draft' && held.accountId !== accountOf(ctx).id)
  )
    throw notAvailable();
  authorizeTarget(ctx, { purpose, target }, true);
  return held.upload;
}

export function claimMockProductUpload(id: string, productId: string): void {
  const held = uploads.get(id);
  if (held) held.upload = { ...held.upload, target: { kind: 'product', id: productId } };
}

function notAvailable(): MockError {
  return new MockError(404, 'NOT_FOUND', 'Upload not found', { reason: 'UPLOAD_NOT_AVAILABLE' });
}

function authorizeTarget(ctx: MockContext, request: UploadRequest, writing: boolean): void {
  const productPurpose = ['product_media', 'digital_asset', 'digital_preview'].includes(
    request.purpose
  );
  const productTarget =
    request.target.kind === 'product' || request.target.kind === 'product_draft';
  if (productPurpose !== productTarget)
    throw invalid('target', 'This purpose cannot use this target', 'UPLOAD_TARGET_CHANGED');
  const capability: Capability = productTarget
    ? request.target.kind === 'product_draft'
      ? 'CREATE_PRODUCTS'
      : writing
        ? 'EDIT_PRODUCTS'
        : 'VIEW_PRODUCTS'
    : writing
      ? 'HANDLE_RETURNS'
      : 'VIEW_RETURNS';
  requireCapability(ctx, capability);
  const actorId = accountOf(ctx).id;
  if (request.target.kind === 'product_draft') {
    const draft = targets.find(
      (entry) => entry.target.kind === 'product_draft' && entry.target.id === request.target.id
    );
    if (draft?.actorId && draft.actorId !== actorId) throw notAvailable();
    if (!draft && writing) {
      targets.push({ target: request.target, actorId, vendorIds: [grantOf(ctx).vendorId] });
    } else if (!draft) throw notAvailable();
    return;
  }
  const target = targets.find(
    (entry) => entry.target.kind === request.target.kind && entry.target.id === request.target.id
  );
  if (!target) throw notAvailable();
  const scope = scopeOf(grantOf(ctx));
  if (scope.kind !== 'store') {
    const reachable =
      scope.kind === 'sellerStaff'
        ? target.vendorIds.every((vendor) => vendor === scope.vendorId)
        : target.vendorIds.includes(scope.vendorId);
    if (!reachable) throw notAvailable();
  }
}

function requestOf(ctx: MockContext): { request: UploadRequest; file: MockMultipartFile } {
  const body = bodyOf(ctx);
  let target: unknown;
  try {
    target = typeof body.target === 'string' ? JSON.parse(body.target) : undefined;
  } catch {
    throw invalid('target', 'Invalid target');
  }
  const parsed = BizUploadRequest.safeParse({ purpose: body.purpose, target });
  if (!parsed.success) throw invalid('purpose', 'An upload purpose and target are required');
  const file = body.file;
  if (!isMockMultipartFile(file)) {
    throw invalid('file', 'One binary file is required');
  }
  const binary = file;
  const policy = MOCK_UPLOAD_POLICIES[parsed.data.purpose];
  if (binary.size <= 0 || binary.size > policy.maxBytes)
    throw new MockError(413, 'VALIDATION_ERROR', 'File is too large or empty', {
      reason: 'UPLOAD_TOO_LARGE',
    });
  if (
    policy.mimeTypes.length &&
    !policy.mimeTypes.includes((binary.mimeType.split(';')[0] ?? '').trim().toLowerCase())
  )
    throw invalid('file', 'File type is not allowed', 'UPLOAD_TYPE_NOT_ALLOWED');
  return { request: parsed.data, file: binary };
}

function uploadOf(ctx: MockContext, id: string): StoredUpload {
  const held = uploads.get(id);
  if (!held || held.workspace !== grantOf(ctx).workspace) throw notAvailable();
  if (held.upload.target.kind === 'product_draft' && held.accountId !== accountOf(ctx).id)
    throw notAvailable();
  authorizeTarget(ctx, held.upload, false);
  return held;
}

export const routes: readonly MockRoute[] = [
  {
    method: 'POST',
    path: '/uploads',
    access: 'workspace',
    idempotent: true,
    authorize: (ctx) => {
      if (!OperationQuery.safeParse({ key: ctx.headers.get('idempotency-key') }).success)
        throw invalid('Idempotency-Key', 'A valid operation key is required');
      authorizeTarget(ctx, requestOf(ctx).request, true);
    },
    handle: (ctx) => {
      const { request, file } = requestOf(ctx);
      authorizeTarget(ctx, request, true);
      const id = `upload_${state.nextId++}`;
      const isPrivate = ['digital_asset', 'return_evidence', 'return_label'].includes(
        request.purpose
      );
      const upload: BizUpload = {
        id,
        ...request,
        filename: file.filename,
        mimeType: file.mimeType,
        size: file.size,
        private: isPrivate,
        ...(isPrivate
          ? {}
          : { url: `${MOCK_ORIGIN}/media/${id}/${encodeURIComponent(file.filename)}` }),
      };
      uploads.set(id, { upload, accountId: accountOf(ctx).id, workspace: grantOf(ctx).workspace });
      const operation = {
        key: ctx.headers.get('idempotency-key') ?? '',
        state: 'succeeded' as const,
        routeId: 'uploads.create',
        resources: [{ kind: 'upload' as const, id }],
        updatedAt: new Date().toISOString(),
      };
      keepMockOperation(ctx, operation, (current) => {
        if (!uploads.has(id)) throw notAvailable();
        authorizeTarget(current, request, true);
      });
      return { operation, upload };
    },
  },
  {
    method: 'GET',
    path: /^\/uploads\/([^/]+)\/access$/,
    access: 'workspace',
    handle: (ctx, [id = '']) => {
      const held = uploadOf(ctx, id);
      if (!held.upload.private) throw notAvailable();
      return {
        url: `${MOCK_ORIGIN}/private/${id}?access=mock-${state.nextId++}`,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
      };
    },
  },
  {
    method: 'GET',
    path: /^\/uploads\/([^/]+)$/,
    access: 'workspace',
    handle: (ctx, [id = '']) => uploadOf(ctx, id).upload,
  },
];
