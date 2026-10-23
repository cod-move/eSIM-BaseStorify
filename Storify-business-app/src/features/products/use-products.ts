import {
  onlineManager,
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';

import {
  adjustStock,
  getProduct,
  getProductFilters,
  getProducts,
  getProductStock,
  getStockMovements,
  updateProduct,
} from '@/api/endpoints/products';
import { etagPages, nextCursor } from '@/api/etag-query';
import { NetworkError, isApiError, isNetworkError } from '@/api/errors';
import { useKeyedMutation } from '@/api/keyed-mutation';
import { showAnswer } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import type {
  ProductDetail,
  ProductListItem,
  ProductListQuery,
  ProductUpdateRequest,
  StockAdjustmentRequest,
  StockMovementList,
  StockMovementQuery,
} from '@/contracts/mobile/biz/v1';
import { useWorkspaceScope } from '@/features/workspace/use-workspace';

import { checkChange, ProductChangedError } from './product-changes';

/** What the list is filtered by. With `barcode` (what the scanner read, as read), `search` is ignored. */
export type ProductFilter = Pick<
  ProductListQuery,
  'search' | 'barcode' | 'status' | 'lowStock' | 'categoryId' | 'brandId' | 'collectionId'
>;

/**
 * Products, newest first, a page at a time. With `barcode`, every product
 * carrying the code as a barcode or a SKU, on one page (normally one): the
 * store cleans the code up as its register does, so send it as scanned.
 */
export function useProducts(filter: ProductFilter = {}) {
  const scope = useWorkspaceScope();

  return useInfiniteQuery({
    queryKey: queryKeys.productList(scope, filter),
    queryFn: scope
      ? ({ pageParam, signal }) => getProducts(scope, { ...filter, cursor: pageParam }, signal)
      : skipToken,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.items),
  });
}

/** What the list can be narrowed by (GET /products/filters): the operator's own categories, brands and collections. */
export function useProductFilters() {
  const scope = useWorkspaceScope();
  return useQuery({
    queryKey: queryKeys.productFilters(scope),
    queryFn: scope ? ({ signal }) => getProductFilters(scope, signal) : skipToken,
  });
}

/**
 * Finds the products carrying a code the scanner read (or the operator typed):
 * as a barcode or a SKU, on the product or a variant, all on one page. The code
 * goes as read; the store cleans it up as its register does.
 *
 * Offline it fails at once with a `NetworkError`, so the scanner shows the
 * failure and "Try again" instead of waiting for the connection; a lookup the
 * connection drops halfway is not held back either (`networkMode`).
 */
export function useFindByCode(): (code: string) => Promise<ProductListItem[]> {
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();

  return useCallback(
    async (code) => {
      if (!scope) throw new Error('No workspace yet');
      if (!onlineManager.isOnline()) throw new NetworkError('offline');
      const list = await queryClient.fetchQuery({
        queryKey: queryKeys.productScan(scope, code),
        queryFn: ({ signal }) => getProducts(scope, { barcode: code }, signal),
        networkMode: 'always',
      });
      return list.items;
    },
    [scope, queryClient]
  );
}

/** One product, with its variants, prices, stock per location and `version`. */
export function useProduct(id: string) {
  const scope = useWorkspaceScope();

  return useQuery({
    queryKey: queryKeys.product(scope, id),
    queryFn: scope ? ({ signal }) => getProduct(scope, id, signal) : skipToken,
  });
}

/** A product's stock: available, committed, unavailable and on hand, per row and location. */
export function useProductStock(id: string) {
  const scope = useWorkspaceScope();

  return useQuery({
    queryKey: queryKeys.productStock(scope, id),
    queryFn: scope ? ({ signal }) => getProductStock(scope, id, signal) : skipToken,
  });
}

/** What a product's stock history is narrowed to: one location, one variant. */
export type StockMovementFilter = Pick<StockMovementQuery, 'locationId' | 'variantId'>;

/**
 * What moved a product's stock (adjustments, transfers, returns put back on
 * sale), newest first, a page at a time, as the store records it. Sales and
 * cancelled orders are not listed: the store keeps no such record of them. A
 * staff member limited to some locations gets those locations' movements only.
 */
export function useStockMovements(id: string, filter: StockMovementFilter = {}) {
  const scope = useWorkspaceScope();

  return useInfiniteQuery({
    queryKey: queryKeys.stockMovements(scope, id, filter),
    queryFn: scope
      ? etagPages<StockMovementList>((cursor, options) =>
          getStockMovements(scope, id, { ...filter, cursor }, options)
        )
      : skipToken,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextCursor,
    select: (data) => data.pages.flatMap((page) => page.data.items),
  });
}

/**
 * Changes a product's price, compare-at price or status (or its variants'
 * prices), against the copy the edit started from (`base`, whose `version`
 * goes out as `If-Match`).
 *
 * A 412 is settled here, by the rule in `product-changes.ts`: the product is
 * read again; when the change already went through, or somebody changed only
 * other fields, it resolves as if nothing happened (sending the change again
 * with the new version if needed). Only when somebody changed the same fields
 * does it reject with `ProductChangedError`, which carries the product as it
 * is now; the screen shows it and lets the operator decide.
 *
 * Other refusals: `PRICE_ON_REQUEST` (409: change it on the website),
 * `VARIANT_PRICES` (400: price the variants), a seller's pre-order rules
 * (400 with `errors.preorder`). Offline, nothing is sent: it fails at once
 * with a `NetworkError`.
 *
 * When no answer comes back, the change may have been made: the product and
 * its lists are read again, so the page shows what the store now holds and
 * the next edit starts from its `version` (from the old one, the 412 would
 * blame "someone else" for the operator's own change).
 */
export function useUpdateProduct(id: string) {
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      changes,
      base,
    }: {
      changes: ProductUpdateRequest;
      base: ProductDetail;
    }) => {
      if (!scope) throw new Error('No workspace yet');
      if (!onlineManager.isOnline()) throw new NetworkError('offline');
      try {
        return await updateProduct(scope, id, changes, base.version);
      } catch (error) {
        if (!isApiError(error) || error.code !== 'PRECONDITION_FAILED') throw error;
        const current = await getProduct(scope, id);
        const check = checkChange(changes, base, current);
        if (check === 'applied') return current;
        if (check === 'conflict') throw new ProductChangedError(current);
        return updateProduct(scope, id, changes, current.version);
      }
    },
    onSuccess: async (product) => {
      await showAnswer(queryClient, queryKeys.product(scope, id), product);
      void queryClient.invalidateQueries({ queryKey: queryKeys.productLists(scope) });
    },
    onError: async (error) => {
      if (error instanceof ProductChangedError) {
        await showAnswer(queryClient, queryKeys.product(scope, id), error.product);
      } else if (isNetworkError(error)) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.product(scope, id) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.productLists(scope) });
      }
    },
  });
}

/**
 * One adjustment as the stock sheet sends it: the units, and `draft`, the
 * sheet's own id for the change, new each time the sheet opens.
 */
export type StockChange = { adjustment: StockAdjustmentRequest; draft: string };

/**
 * Adds units (`delta` above 0) or takes them away (below 0) at one location,
 * with a reason: one `Idempotency-Key` per tap, kept for its retries and, while
 * it has no answer, for the next tap of the same change from the same `draft`,
 * so "Try again" in the sheet never counts twice. An attempt lives as long as
 * the opening of the sheet that made it: another sheet's change, or the same
 * units counted again in a new opening, is a change of its own, with its own key.
 *
 * The answer is the product's stock as it now is, shown at once, and the stock
 * is asked again behind it: the answer to "Try again" is the first try's,
 * replayed, from before any change made since. Without an answer, or after a
 * refusal, the change may have been made: the read shows what the store now
 * holds. The product, its list, its stock history and Home (low stock) are asked
 * again too.
 */
export function useStockAdjustment(id: string) {
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();

  return useKeyedMutation({
    attemptKey: ({ draft }: StockChange) => ['stock-adjustment', scope?.workspace, id, draft],
    send: ({ adjustment }: StockChange, idempotencyKey: string) => {
      if (!scope) throw new Error('No workspace yet');
      return adjustStock(scope, id, adjustment, idempotencyKey);
    },
    onSuccess: async (stock) => {
      await showAnswer(queryClient, queryKeys.productStock(scope, id), stock);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.productStock(scope, id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stockMovementLists(scope, id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.product(scope, id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.productLists(scope) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.home(scope) });
    },
  });
}
