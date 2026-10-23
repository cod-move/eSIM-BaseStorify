import { useQuery } from '@tanstack/react-query';

import { getProduct, getProductBrand, getProductVendor } from '@/api/endpoints/product';
import { etagQuery, selectData } from '@/api/etag-query';
import { queryKeys } from '@/api/query-keys';
import type { ImageSet, ProductDetail, Rating } from '@/contracts/mobile/shop/v1';
import { useConfig } from '@/features/config/use-config';
import { useLocale } from '@/i18n/locale-store';

export function useProduct(slug: string) {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.product(locale, slug),
    queryFn: etagQuery((options) => getProduct(locale, slug, options)),
    select: selectData,
  });
}

/** Who the seller tile shows, and where it leads. */
export type ProductSeller = {
  name: string;
  logo?: ImageSet;
  rating?: Rating;
  /** The seller's products. Becomes the vendor's or brand's page once the app has one. */
  href: { pathname: '/products'; params: { vendor: string } | { brand: string } };
};

/**
 * The seller tile's data. A marketplace shows the product's vendor,
 * with the vendor's rating; a single shop shows the product's brand, which has
 * no rating. So does a marketplace product whose vendor has no page of its own
 * (the store selling as itself answers 404), and a product with neither shows
 * no tile. Until the seller's own record arrives, the tile shows the name the
 * product carries, so it never waits on a second request.
 */
export function useProductSeller(product: ProductDetail | undefined): ProductSeller | undefined {
  const locale = useLocale();
  const multiVendor = useConfig().data?.features.multiVendor ?? false;
  const vendorSlug = multiVendor ? product?.vendor?.slug : undefined;

  const vendor = useQuery({
    queryKey: queryKeys.productVendor(locale, vendorSlug ?? ''),
    queryFn: etagQuery((options) => getProductVendor(locale, vendorSlug ?? '', options)),
    select: selectData,
    enabled: vendorSlug !== undefined,
    retry: false,
  });
  const vendorAvailable = vendorSlug !== undefined && !vendor.isError;
  const brandSlug = vendorAvailable ? undefined : product?.brand?.slug;
  const brand = useQuery({
    queryKey: queryKeys.productBrand(locale, brandSlug ?? ''),
    queryFn: etagQuery((options) => getProductBrand(locale, brandSlug ?? '', options)),
    select: selectData,
    enabled: brandSlug !== undefined,
  });

  if (vendorSlug !== undefined && vendorAvailable && product?.vendor) {
    return {
      name: vendor.data?.name ?? product.vendor.name,
      logo: vendor.data?.logo,
      rating: vendor.data?.rating,
      href: { pathname: '/products', params: { vendor: vendorSlug } },
    };
  }
  if (brandSlug !== undefined && product?.brand) {
    return {
      name: brand.data?.name ?? product.brand.name,
      logo: brand.data?.logo,
      href: { pathname: '/products', params: { brand: brandSlug } },
    };
  }
  return undefined;
}
