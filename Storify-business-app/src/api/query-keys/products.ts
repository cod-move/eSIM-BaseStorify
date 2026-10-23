import type { ProductListQuery, StockMovementQuery } from '@/contracts/mobile/biz/v1';

import type { WorkspaceScope } from '../scope';
import { inWorkspace } from './shared';

type ProductFilter = Omit<ProductListQuery, 'cursor' | 'limit'>;
type StockMovementFilter = Omit<StockMovementQuery, 'cursor' | 'limit'>;

export const productsKeys = {
  productEditor: (scope: WorkspaceScope | null, id: string) =>
    [...inWorkspace(scope, 'products'), 'editor', id, scope?.locale] as const,
  productFormOptions: (scope: WorkspaceScope | null, id: string | null) =>
    [...inWorkspace(scope, 'products'), 'form-options', id ?? 'create', scope?.locale] as const,
  digitalAssetAccess: (scope: WorkspaceScope | null, id: string, assetId: string) =>
    [...inWorkspace(scope, 'products'), 'digital-access', id, assetId, scope?.locale] as const,
  /** Every product list of the workspace, whatever the filter and language. */
  productLists: (scope: WorkspaceScope | null) =>
    [...inWorkspace(scope, 'products'), 'list'] as const,
  productList: (scope: WorkspaceScope | null, filter: ProductFilter) =>
    [...inWorkspace(scope, 'products'), 'list', scope?.locale, filter] as const,
  /** What the list can be narrowed by: categories, brands, collections. */
  productFilters: (scope: WorkspaceScope | null) =>
    [...inWorkspace(scope, 'products'), 'filters', scope?.locale] as const,
  product: (scope: WorkspaceScope | null, id: string) =>
    [...inWorkspace(scope, 'products'), 'detail', id, scope?.locale] as const,
  productStock: (scope: WorkspaceScope | null, id: string) =>
    [...inWorkspace(scope, 'products'), 'stock', id, scope?.locale] as const,
  /** Every stock history of a product, whatever the filter and language. */
  stockMovementLists: (scope: WorkspaceScope | null, id: string) =>
    [...inWorkspace(scope, 'products'), 'stock-movements', id] as const,
  stockMovements: (scope: WorkspaceScope | null, id: string, filter: StockMovementFilter) =>
    [...inWorkspace(scope, 'products'), 'stock-movements', id, scope?.locale, filter] as const,
  /** The products carrying a scanned code (one page, not a paged list). */
  productScan: (scope: WorkspaceScope | null, code: string) =>
    [...inWorkspace(scope, 'products'), 'scan', code, scope?.locale] as const,
};
