import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { getProducts } from '@/api/endpoints/products';
import { STALE } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import type { ProductListQuery } from '@/contracts/mobile/shop/v1';
import { useLocale } from '@/i18n/locale-store';

/**
 * What a line says of its product: enough to open its page. A cart, order,
 * checkout or return line fits as it is.
 */
export type ProductRef = {
  name: string;
  /**
   * The product's page address. Only a store older than the contract's `slug`
   * leaves it out of a line (or the product is gone, on an order or a return).
   */
  slug?: string;
  productId?: string;
};

/**
 * Opens the product a line is of, or its write-a-review screen (`review`). A
 * line with a `slug` opens it at once. A line without one names its product by
 * id, and the page is found by its slug, so the store's search is asked for
 * the line's name and the card with the same id gives the slug; a product that
 * search does not find, or a line with no id, opens that search instead.
 */
export function useOpenProduct(): (product: ProductRef, to?: 'product' | 'review') => void {
  const router = useRouter();
  const locale = useLocale();
  const queryClient = useQueryClient();

  const open = (slug: string, to: 'product' | 'review') => {
    if (to === 'review')
      router.push({ pathname: '/products/[slug]/write-review', params: { slug } });
    else router.push({ pathname: '/products/[slug]', params: { slug } });
  };

  return (product, to = 'product') => {
    if (product.slug) {
      open(product.slug, to);
      return;
    }

    const query: ProductListQuery = { q: product.name, limit: 20 };
    queryClient
      .fetchQuery({
        queryKey: queryKeys.products(locale, query),
        queryFn: ({ signal }) => getProducts(locale, query, signal),
        staleTime: STALE.public,
      })
      .then((list) =>
        product.productId
          ? list.items.find((card) => card.id === product.productId)?.slug
          : undefined
      )
      .catch(() => undefined)
      .then((slug) => {
        if (slug) open(slug, to);
        else router.push({ pathname: '/search', params: { q: product.name } });
      });
  };
}
