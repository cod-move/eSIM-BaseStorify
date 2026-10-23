/**
 * The mock store's data for: the brand list and a brand's page. The first brands
 * are those the product lists are narrowed by (`MOCK_BRANDS`), so a page and its
 * products agree; the rest only fill the list past one page, as a large store's would.
 */
import type { BrandDetail, BrandSummary } from '@/contracts/mobile/shop/v1';

import { listProducts, MOCK_BRANDS } from './products';
import { picture } from './shared';

const ABOUT: Record<string, Pick<BrandDetail, 'description' | 'websiteUrl'>> = {
  fieldnote: {
    description: 'Waxed canvas and leather goods, sewn in small runs.',
    websiteUrl: 'https://example.com/fieldnote',
  },
};

/** Enough brands that the list takes more than one page of the contract's largest size. */
const FILLER_COUNT = 45;

const FILLERS = Array.from({ length: FILLER_COUNT }, (_, index) => {
  const number = String(index + 1).padStart(2, '0');
  return { slug: `atelier-${number}`, name: `Atelier ${number}` };
});

function summary(slug: string, name: string, productCount: number): BrandSummary {
  return { id: `brand_${slug}`, slug, name, logo: picture(`brand-${slug}`, name), productCount };
}

export function listBrands(): BrandSummary[] {
  const products = listProducts('en');
  return [
    ...MOCK_BRANDS.map((brand) =>
      summary(
        brand.slug,
        brand.name,
        products.filter((product) => brand.categories.includes(product.category)).length
      )
    ),
    ...FILLERS.map((brand) => summary(brand.slug, brand.name, 0)),
  ];
}

export function findBrand(slug: string): BrandDetail | undefined {
  const brand = listBrands().find((candidate) => candidate.slug === slug);
  return brand ? { ...brand, ...ABOUT[brand.slug] } : undefined;
}
