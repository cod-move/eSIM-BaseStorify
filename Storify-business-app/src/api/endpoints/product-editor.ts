import {
  BizUploadAccess,
  ProductEditorDetail,
  ProductEditorResult,
  ProductFormOptions,
  ProductVariantGeneration,
  type ProductCreateRequest,
  type ProductEditorActionRequest,
  type ProductSaveRequest,
  type ProductVariantGenerateRequest,
} from '@/contracts/mobile/biz/v1';

import { api } from '../api';
import type { WorkspaceScope } from '../scope';

const productPath = (id: string) => `/products/${encodeURIComponent(id)}`;

export function getProductEditor(scope: WorkspaceScope, id: string, signal?: AbortSignal) {
  return api.data({ ...scope, path: `${productPath(id)}/editor`, signal }, ProductEditorDetail);
}

export function getProductFormOptions(
  scope: WorkspaceScope,
  id: string | null,
  signal?: AbortSignal
) {
  return api.data(
    { ...scope, path: '/products/form-options', query: id ? { productId: id } : {}, signal },
    ProductFormOptions
  );
}

export function createFullProduct(
  scope: WorkspaceScope,
  request: ProductCreateRequest,
  key: string,
  signal?: AbortSignal
) {
  return api.data(
    { ...scope, path: '/products', method: 'POST', body: request, idempotencyKey: key, signal },
    ProductEditorResult
  );
}

export function saveFullProduct(
  scope: WorkspaceScope,
  id: string,
  request: ProductSaveRequest,
  version: string,
  key: string,
  signal?: AbortSignal
) {
  return api.data(
    {
      ...scope,
      path: `${productPath(id)}/editor`,
      method: 'PATCH',
      body: request,
      ifMatch: version,
      idempotencyKey: key,
      signal,
    },
    ProductEditorResult
  );
}

export function fullProductAction(
  scope: WorkspaceScope,
  id: string,
  action: ProductEditorActionRequest,
  version: string,
  key: string,
  signal?: AbortSignal
) {
  return api.data(
    {
      ...scope,
      path: `${productPath(id)}/actions`,
      method: 'POST',
      body: action,
      ifMatch: version,
      idempotencyKey: key,
      signal,
    },
    ProductEditorResult
  );
}

export function generateProductVariants(
  scope: WorkspaceScope,
  request: ProductVariantGenerateRequest,
  signal?: AbortSignal
) {
  return api.data(
    { ...scope, path: '/products/variants/generate', method: 'POST', body: request, signal },
    ProductVariantGeneration
  );
}

export function getDigitalAssetAccess(
  scope: WorkspaceScope,
  id: string,
  assetId: string,
  signal?: AbortSignal
) {
  return api.data(
    { ...scope, path: `${productPath(id)}/digital-assets/${encodeURIComponent(assetId)}`, signal },
    BizUploadAccess
  );
}
