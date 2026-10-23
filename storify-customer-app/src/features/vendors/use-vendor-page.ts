import type { Category, ImageSet } from '@/contracts/mobile/shop/v1';
import { useFacets } from '@/features/browse/use-browse';
import { useCategories } from '@/features/categories/use-categories';

export type VendorCategory = { slug: string; name: string; image?: ImageSet };

/**
 * The categories a seller has products in, as the store's facets for that
 * seller name them, each with its picture from the store's category tree.
 */
export function useVendorCategories(vendor: string): VendorCategory[] {
  const facets = useFacets({ vendor });
  const tree = useCategories();

  const imageOf = new Map(
    flatten(tree.data ?? []).map((category) => [category.slug, category.image])
  );
  return (facets.data?.categories ?? []).map((category) => ({
    slug: category.slug,
    name: category.name,
    image: imageOf.get(category.slug),
  }));
}

function flatten(tree: Category[]): Category[] {
  return tree.flatMap((category) => [category, ...flatten(category.children)]);
}
