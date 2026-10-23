/**
 * The mock store's products as the lists show them. The home page, the cart and
 * the product page are made from the same seeds.
 *
 * This file plays the server, so it decides what the app itself must never
 * work out: what can be bought, how many, and whether an option has to be
 * chosen first. Everything it produces is checked against the contract in
 * `__tests__/mock-catalog.test.ts`.
 */
import type {
  Availability,
  ProductCard,
  ProductOption,
  ProductVariant,
} from '@/contracts/mobile/shop/v1';

import { money, picture } from './shared';

export type Seed = {
  slug: string;
  name: string;
  category: string;
  price: number;
  compareAt?: number;
  rating?: [average: number, count: number];
  availability?: Availability;
  vendor?: string;
  sponsored?: boolean;
  priceOnRequest?: boolean;
  isDigital?: boolean;
  /** Option name → values. Every combination becomes a variant. */
  options?: Record<string, string[]>;
  /** Added to the price of the variants that have the option's second value onwards. */
  variantStep?: number;
};

export const SEEDS: Seed[] = [
  {
    slug: 'canvas-weekender-bag',
    name: 'Canvas weekender bag',
    category: 'bags',
    price: 89,
    compareAt: 120,
    rating: [4.6, 214],
    vendor: 'North Trail',
    sponsored: true,
  },
  {
    slug: 'everyday-cotton-tee',
    name: 'Everyday cotton tee',
    category: 'clothing',
    price: 24,
    rating: [4.4, 1032],
    options: { Colour: ['White', 'Black', 'Sage'], Size: ['S', 'M', 'L', 'XL'] },
  },
  {
    slug: 'trail-running-shoes',
    name: 'Trail running shoes',
    category: 'shoes',
    price: 129,
    compareAt: 159,
    rating: [4.8, 389],
    vendor: 'North Trail',
    options: { Size: ['40', '41', '42', '43', '44'] },
  },
  {
    slug: 'ceramic-pour-over-set',
    name: 'Ceramic pour-over set',
    category: 'home',
    price: 54,
    rating: [4.7, 96],
    vendor: 'Kiln & Co',
  },
  {
    slug: 'wireless-earbuds-pro',
    name: 'Wireless earbuds Pro',
    category: 'electronics',
    price: 149,
    compareAt: 179,
    rating: [4.5, 2210],
    options: { Colour: ['Graphite', 'Pearl'] },
    variantStep: 10,
  },
  {
    slug: 'linen-throw-blanket',
    name: 'Linen throw blanket',
    category: 'home',
    price: 72,
    rating: [4.3, 58],
    availability: 'OUT_OF_STOCK',
    vendor: 'Kiln & Co',
  },
  {
    slug: 'leather-card-holder',
    name: 'Leather card holder',
    category: 'bags',
    price: 35,
    rating: [4.9, 640],
  },
  {
    slug: 'studio-monitor-headphones',
    name: 'Studio monitor headphones',
    category: 'headphones',
    price: 219,
    rating: [4.6, 171],
    availability: 'PRE_ORDER',
  },
  {
    slug: 'merino-crew-sweater',
    name: 'Merino crew sweater',
    category: 'clothing',
    price: 98,
    compareAt: 130,
    rating: [4.7, 322],
    options: { Colour: ['Oat', 'Navy'], Size: ['S', 'M', 'L'] },
  },
  {
    slug: 'oak-desk-organiser',
    name: 'Oak desk organiser',
    category: 'home',
    price: 46,
    vendor: 'Kiln & Co',
  },
  {
    slug: 'commuter-backpack-22l',
    name: 'Commuter backpack 22L',
    category: 'bags',
    price: 110,
    rating: [4.5, 449],
    vendor: 'North Trail',
  },
  {
    slug: 'custom-engraved-watch',
    name: 'Custom engraved watch',
    category: 'accessories',
    price: 0,
    priceOnRequest: true,
  },
  {
    slug: 'minimal-leather-sneakers',
    name: 'Minimal leather sneakers',
    category: 'shoes',
    price: 139,
    rating: [4.4, 203],
    options: { Size: ['39', '40', '41', '42', '43'] },
  },
  {
    slug: 'photo-presets-pack',
    name: 'Photo presets pack',
    category: 'digital',
    price: 19,
    rating: [4.2, 87],
    isDigital: true,
  },
  {
    slug: 'insulated-steel-bottle',
    name: 'Insulated steel bottle',
    category: 'accessories',
    price: 28,
    compareAt: 34,
    rating: [4.8, 1540],
    options: { Colour: ['Steel', 'Forest', 'Clay'] },
  },
  {
    slug: 'smart-desk-lamp',
    name: 'Smart desk lamp',
    category: 'electronics',
    price: 64,
    rating: [4.3, 266],
    sponsored: true,
  },
  {
    slug: 'relaxed-linen-shirt',
    name: 'Relaxed linen shirt',
    category: 'clothing',
    price: 58,
    rating: [4.5, 145],
    options: { Size: ['S', 'M', 'L', 'XL'] },
  },
  {
    slug: 'wool-blend-beanie',
    name: 'Wool blend beanie',
    category: 'accessories',
    price: 22,
    rating: [4.6, 310],
  },
];

const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export function buildOptions(seed: Seed): ProductOption[] {
  return Object.entries(seed.options ?? {}).map(([name, values]) => ({
    id: slugify(name),
    name,
    values: values.map((label) => ({ id: `${slugify(name)}-${slugify(label)}`, label })),
  }));
}

export function buildVariants(
  seed: Seed,
  options: ProductOption[],
  locale: string
): ProductVariant[] {
  let combinations: string[][] = [[]];
  for (const option of options) {
    combinations = combinations.flatMap((chosen) =>
      option.values.map((value) => [...chosen, value.id])
    );
  }
  if (options.length === 0) return [];

  return combinations.map((optionValueIds, index) => {
    // Every fifth variant is sold out, so the option picker has something to disable.
    const soldOut = index % 5 === 4;
    const firstOption = options[0];
    const step = firstOption
      ? firstOption.values.findIndex((value) => value.id === optionValueIds[0])
      : 0;
    return {
      id: `${seed.slug}--${optionValueIds.join('--')}`,
      optionValueIds,
      price: money(seed.price + step * (seed.variantStep ?? 0), locale),
      compareAtPrice: seed.compareAt ? money(seed.compareAt, locale) : undefined,
      availability: soldOut ? 'OUT_OF_STOCK' : (seed.availability ?? 'IN_STOCK'),
      maxQuantity: soldOut ? 0 : 5,
    };
  });
}

export function toCard(seed: Seed, locale: string): ProductCard {
  const availability = seed.availability ?? 'IN_STOCK';
  return {
    id: `prod_${seed.slug}`,
    slug: seed.slug,
    name: seed.name,
    image: picture(seed.slug, seed.name),
    price: seed.priceOnRequest ? undefined : money(seed.price, locale),
    compareAtPrice: seed.compareAt ? money(seed.compareAt, locale) : undefined,
    priceVaries: Boolean(seed.variantStep),
    rating: seed.rating ? { average: seed.rating[0], count: seed.rating[1] } : undefined,
    availability,
    requiresVariantChoice: Boolean(seed.options),
    priceOnRequest: Boolean(seed.priceOnRequest),
    isDigital: Boolean(seed.isDigital),
    purchasableInApp: !seed.isDigital && !seed.priceOnRequest,
    sponsored: seed.sponsored ? { campaignId: `camp_${seed.slug}` } : undefined,
    vendor: seed.vendor ? { name: seed.vendor, slug: slugify(seed.vendor) } : undefined,
  };
}

export function listProducts(locale: string): (ProductCard & { category: string })[] {
  return SEEDS.map((seed) => ({ ...toCard(seed, locale), category: seed.category }));
}

/** The mock store's brands. Each product's brand follows from its category. */
export const MOCK_BRANDS = [
  { slug: 'arcwave', name: 'Arcwave', categories: ['electronics', 'headphones', 'digital'] },
  { slug: 'fieldnote', name: 'Fieldnote', categories: ['bags', 'shoes', 'accessories'] },
  { slug: 'loam', name: 'Loam', categories: ['home', 'clothing'] },
];

export function brandOf(category: string): { slug: string; name: string } | undefined {
  return MOCK_BRANDS.find((brand) => brand.categories.includes(category));
}
