/** The mock store's product page. */
import type { ProductDetail, VendorDetail } from '@/contracts/mobile/shop/v1';

import { CATEGORIES } from './categories';
import { SEEDS, buildOptions, buildVariants, toCard } from './products';
import { money, picture } from './shared';

/**
 * A phone sold in Colour and Storage, shaped as a real store may answer it
 * (the live store was unreachable, so this is the shape suspected from the
 * contract, not a copy): the value ids are only unique within their option
 * ("1" is both Black and 256 GB), one combination does not exist (Silver with
 * 512 GB), and the store lists an option no variant uses and no value.
 */
const PHONE_SLUG = 'phone-ultra-sparse-variants';

function phoneProduct(locale: string): ProductDetail {
  const variant = (id: string, optionValueIds: string[], amount: number) => ({
    id,
    optionValueIds,
    price: money(amount, locale),
    availability: 'IN_STOCK' as const,
    maxQuantity: 3,
  });

  return {
    id: `prod_${PHONE_SLUG}`,
    slug: PHONE_SLUG,
    name: 'Ultra Phone',
    image: picture(PHONE_SLUG, 'Ultra Phone'),
    price: money(1299, locale),
    priceVaries: true,
    availability: 'IN_STOCK',
    requiresVariantChoice: true,
    priceOnRequest: false,
    isDigital: false,
    purchasableInApp: true,
    images: [picture(`${PHONE_SLUG}-0`, 'Ultra Phone')],
    attributes: [],
    options: [
      {
        id: 'opt-colour',
        name: 'Colour',
        values: [
          { id: '1', label: 'Black' },
          { id: '2', label: 'Silver' },
        ],
      },
      {
        id: 'opt-storage',
        name: 'Storage',
        values: [
          { id: '1', label: '256 GB' },
          { id: '2', label: '512 GB' },
        ],
      },
      { id: 'opt-warranty', name: 'Warranty', values: [] },
    ],
    variants: [
      variant('var-black-256', ['1', '1'], 1299),
      variant('var-black-512', ['1', '2'], 1499),
      variant('var-silver-256', ['2', '1'], 1319),
    ],
    maxQuantity: 0,
    shareUrl: `https://mock.storify.invalid/products/${PHONE_SLUG}`,
    related: [],
    sponsoredRail: [],
  };
}

export function findProduct(slug: string, locale: string): ProductDetail | undefined {
  if (slug === PHONE_SLUG) return phoneProduct(locale);
  const seed = SEEDS.find((candidate) => candidate.slug === slug);
  if (!seed) return undefined;

  const card = toCard(seed, locale);
  const options = buildOptions(seed);
  const category = CATEGORIES.find((candidate) => candidate.slug === seed.category);
  const buyable = card.availability !== 'OUT_OF_STOCK' && card.purchasableInApp;

  return {
    ...card,
    images: [0, 1, 2].map((index) => picture(`${seed.slug}-${index}`, seed.name)),
    descriptionHtml: `<p>${seed.name}, made to be used every day. This is sample text from the mock store.</p>`,
    attributes: [
      { name: 'Material', value: 'Sample material' },
      { name: 'Origin', value: 'Sample country' },
    ],
    options,
    variants: buildVariants(seed, options, locale),
    maxQuantity: buyable && options.length === 0 ? 5 : 0,
    category: category ? { name: category.name, slug: category.slug } : undefined,
    shareUrl: `https://mock.storify.invalid/products/${seed.slug}`,
    related: SEEDS.filter(
      (candidate) => candidate.category === seed.category && candidate.slug !== seed.slug
    ).map((candidate) => toCard(candidate, locale)),
    sponsoredRail: [],
  };
}

/**
 * The seller of the product page's tile, built from the products it sells.
 * Moves to the vendors fixtures once the app has a vendor page.
 */
export function findVendor(slug: string): VendorDetail | undefined {
  const products = SEEDS.filter((seed) => seed.vendor && toVendorSlug(seed.vendor) === slug);
  const name = products[0]?.vendor;
  if (!name) return undefined;

  const reviews = products.reduce((sum, seed) => sum + (seed.rating?.[1] ?? 0), 0);
  return {
    id: `vendor-${slug}`,
    slug,
    name,
    logo: picture(`vendor-${slug}`, name),
    verified: true,
    rating: reviews > 0 ? { average: 4.7, count: reviews } : undefined,
    productCount: products.length,
    unitsSold: 0,
  };
}

const toVendorSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
