/** The product lists, their facets, and the brands they are narrowed by. */
import type {
  BrandList,
  ProductCard,
  ProductFacets,
  ProductList,
} from '@/contracts/mobile/shop/v1';

import { categoryScope } from '../fixtures/categories';
import { inCollections } from '../fixtures/collections';
import { brandOf, listProducts, MOCK_BRANDS } from '../fixtures/products';
import { money, picture } from '../fixtures/shared';
import type { MockContext, MockRoute } from '../kit';

export const routes: MockRoute[] = [
  { method: 'GET', path: '/products', handle: productList },
  { method: 'GET', path: '/products/facets', handle: productFacets },
  { method: 'GET', path: '/brands', handle: brandList },
];

type Listed = ProductCard & { category: string };

const price = (product: ProductCard) => product.price?.amount ?? 0;

/** Where a list's products are: a category and all beneath it, a collection, a seller. */
function matchesPlace(product: Listed, query: URLSearchParams): boolean {
  const category = query.get('category')?.split(',');
  const collection = query.get('collection')?.split(',');
  const vendor = query.get('vendor')?.split(',');
  return (
    (!category || categoryScope(category).has(product.category)) &&
    (!collection || inCollections(product.slug, collection)) &&
    (!vendor || vendor.includes(product.vendor?.slug ?? ''))
  );
}

function inScope(query: URLSearchParams): Listed[] {
  return listProducts('en').filter((product) => matchesPlace(product, query));
}

function productList({ query, locale }: MockContext): ProductList {
  const text = query.get('q')?.toLowerCase();
  const brand = query.get('brand')?.split(',');
  const onSale = query.get('onSale') === 'true';
  const inStock = query.get('inStock') === 'true';
  const minPrice = query.has('minPrice') ? Number(query.get('minPrice')) : undefined;
  const maxPrice = query.has('maxPrice') ? Number(query.get('maxPrice')) : undefined;
  const sort = query.get('sort');

  const matching = listProducts(locale).filter(
    (product) =>
      (!text || product.name.toLowerCase().includes(text)) &&
      matchesPlace(product, query) &&
      (!brand || brand.includes(brandOf(product.category)?.slug ?? '')) &&
      (!onSale || product.compareAtPrice !== undefined) &&
      (!inStock || product.availability === 'IN_STOCK') &&
      (minPrice === undefined || price(product) >= minPrice) &&
      (maxPrice === undefined || price(product) <= maxPrice)
  );

  if (sort === 'PRICE_ASC') matching.sort((a, b) => price(a) - price(b));
  if (sort === 'PRICE_DESC') matching.sort((a, b) => price(b) - price(a));
  if (sort === 'NEWEST') matching.reverse();
  if (sort === 'RATING' || sort === 'POPULAR') {
    matching.sort((a, b) => (b.rating?.average ?? 0) - (a.rating?.average ?? 0));
  }

  // The cursor is opaque to the app. Here it happens to be an offset.
  const offset = Number(query.get('cursor') ?? 0);
  const limit = Math.min(Number(query.get('limit') ?? 20), 40);
  const page = matching.slice(offset, offset + limit);

  return {
    items: page.map(({ category: _category, ...card }) => card),
    nextCursor: offset + limit < matching.length ? String(offset + limit) : null,
    total: matching.length,
  };
}

function productFacets({ query, locale }: MockContext): ProductFacets {
  const products = inScope(query);
  const brands = MOCK_BRANDS.filter((brand) =>
    products.some((product) => brand.categories.includes(product.category))
  );
  const prices = products.flatMap((product) => (product.price ? [product.price.amount] : []));
  const low = Math.min(...prices);
  const high = Math.max(...prices);

  return {
    categories: [],
    collections: [],
    brands: brands.map(({ slug, name }) => ({ slug, name })),
    priceRange:
      prices.length > 0 && low < high
        ? { min: money(low, locale), max: money(high, locale), step: 1 }
        : undefined,
  };
}

function brandList(): BrandList {
  return {
    items: MOCK_BRANDS.map(({ slug, name, categories }) => ({
      id: `brand_${slug}`,
      slug,
      name,
      logo: picture(`brand-${slug}`, name),
      productCount: listProducts('en').filter((product) => categories.includes(product.category))
        .length,
    })),
    nextCursor: null,
  };
}
