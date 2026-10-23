import type {
  ProductFilterCategory,
  ProductFilterOptions,
  ProductStatus,
} from '@/contracts/mobile/biz/v1';

import type { ProductFilter } from './use-products';

/** The list's filters, as the filter sheet sets them: one choice of each, or none. */
export type ProductFilterValue = {
  status: ProductStatus | null;
  lowStock: boolean;
  categoryId: string | null;
  brandId: string | null;
  collectionId: string | null;
};

export type ProductFilterKey = keyof ProductFilterValue;

export const NO_PRODUCT_FILTER: ProductFilterValue = {
  status: null,
  lowStock: false,
  categoryId: null,
  brandId: null,
  collectionId: null,
};

/** The filters in the order their chips show. */
export const FILTER_KEYS: readonly ProductFilterKey[] = [
  'status',
  'lowStock',
  'categoryId',
  'brandId',
  'collectionId',
];

/** Whether a filter is on. */
export function isOn(value: ProductFilterValue, key: ProductFilterKey): boolean {
  return key === 'lowStock' ? value.lowStock : value[key] !== null;
}

/** How many filters are on: the count on the filter button. */
export function filterCount(value: ProductFilterValue): number {
  return FILTER_KEYS.filter((key) => isOn(value, key)).length;
}

/** That filter off, the others kept. */
export function without(value: ProductFilterValue, key: ProductFilterKey): ProductFilterValue {
  return { ...value, [key]: NO_PRODUCT_FILTER[key] };
}

/** The list's query for the filters and the search. */
export function queryOf(value: ProductFilterValue, search: string): ProductFilter {
  return {
    ...(search ? { search } : {}),
    ...(value.status ? { status: value.status } : {}),
    ...(value.lowStock ? { lowStock: true } : {}),
    ...(value.categoryId ? { categoryId: value.categoryId } : {}),
    ...(value.brandId ? { brandId: value.brandId } : {}),
    ...(value.collectionId ? { collectionId: value.collectionId } : {}),
  };
}

/** The categories directly under one (`null`: the top of the tree), in the store's order. */
export function childrenOf(
  categories: readonly ProductFilterCategory[],
  parentId: string | null
): ProductFilterCategory[] {
  const known = new Set(categories.map((category) => category.id));
  return categories.filter((category) =>
    parentId === null
      ? !category.parentId || !known.has(category.parentId)
      : category.parentId === parentId
  );
}

/** Whether `id` is `ancestorId` or sits somewhere under it. */
export function isWithin(
  categories: readonly ProductFilterCategory[],
  id: string,
  ancestorId: string
): boolean {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const seen = new Set<string>();
  let cursor: string | undefined = id;
  while (cursor && !seen.has(cursor)) {
    if (cursor === ancestorId) return true;
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentId;
  }
  return false;
}

/** The name of what a filter is set to, from the store's options; undefined until they arrive. */
export function chosenName(
  options: ProductFilterOptions | undefined,
  key: 'categoryId' | 'brandId' | 'collectionId',
  id: string | null
): string | undefined {
  if (!options || !id) return undefined;
  const list =
    key === 'categoryId'
      ? options.categories
      : key === 'brandId'
        ? options.brands
        : options.collections;
  return list.find((option) => option.id === id)?.name;
}
