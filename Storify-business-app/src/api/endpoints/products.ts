/** Endpoints: products, their price and status, and their stock. */
import {
  ProductDetail,
  ProductFilterOptions,
  ProductList,
  ProductStock,
  StockMovementList,
  type ProductListQuery,
  type ProductUpdateRequest,
  type StockAdjustmentRequest,
  type StockMovementQuery,
} from '@/contracts/mobile/biz/v1';

import { api } from '../api';
import type { Conditional } from '../etag-query';
import type { WorkspaceScope } from '../scope';

/** GET /products: a page, newest first; with `barcode`, every product carrying it, on one page. */
export function getProducts(
  { locale, workspace }: WorkspaceScope,
  query: ProductListQuery,
  signal?: AbortSignal
) {
  return api.data({ locale, workspace, path: '/products', query, signal }, ProductList);
}

/** GET /products/filters: the categories (a tree), brands and collections of the operator's products. */
export function getProductFilters({ locale, workspace }: WorkspaceScope, signal?: AbortSignal) {
  return api.data({ locale, workspace, path: '/products/filters', signal }, ProductFilterOptions);
}

/** GET /products/{id}, with its `version` for a change. */
export function getProduct(
  { locale, workspace }: WorkspaceScope,
  id: string,
  signal?: AbortSignal
) {
  return api.data(
    { locale, workspace, path: `/products/${encodeURIComponent(id)}`, signal },
    ProductDetail
  );
}

/**
 * PATCH /products/{id}: the fields sent, against `version` (`If-Match`). 412
 * when the product changed since, 428 without a version.
 */
export function updateProduct(
  { locale, workspace }: WorkspaceScope,
  id: string,
  body: ProductUpdateRequest,
  version: string
) {
  return api.data(
    {
      locale,
      workspace,
      path: `/products/${encodeURIComponent(id)}`,
      method: 'PATCH',
      body,
      ifMatch: version,
    },
    ProductDetail
  );
}

/** GET /products/{id}/stock: available, committed, unavailable and on hand, per row and location. */
export function getProductStock(
  { locale, workspace }: WorkspaceScope,
  id: string,
  signal?: AbortSignal
) {
  return api.data(
    { locale, workspace, path: `/products/${encodeURIComponent(id)}/stock`, signal },
    ProductStock
  );
}

/**
 * GET /products/{id}/stock-movements: what moved the stock, newest first, a
 * page at a time; one location's or one variant's with `locationId` or
 * `variantId`.
 */
export function getStockMovements(
  { locale, workspace }: WorkspaceScope,
  id: string,
  query: StockMovementQuery,
  { etag, signal }: Conditional
) {
  return api.request(
    {
      locale,
      workspace,
      path: `/products/${encodeURIComponent(id)}/stock-movements`,
      query,
      etag,
      signal,
    },
    StockMovementList
  );
}

/** POST /products/{id}/stock-adjustments: units in or out at one location, once per key. */
export function adjustStock(
  { locale, workspace }: WorkspaceScope,
  id: string,
  body: StockAdjustmentRequest,
  idempotencyKey: string
) {
  return api.data(
    {
      locale,
      workspace,
      path: `/products/${encodeURIComponent(id)}/stock-adjustments`,
      method: 'POST',
      body,
      idempotencyKey,
    },
    ProductStock
  );
}
