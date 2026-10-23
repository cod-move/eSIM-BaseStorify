/** The mock store's data for: collections, and the products each one holds. */
import type { CollectionDetail, CollectionSummary } from '@/contracts/mobile/shop/v1';

import { SEEDS } from './products';
import { picture } from './shared';

type CollectionSeed = Omit<CollectionDetail, 'id' | 'image' | 'productCount'> & {
  /** The slugs of the products it holds, in the order the list shows them. */
  products: string[];
};

const COLLECTIONS: CollectionSeed[] = [
  {
    slug: 'summer-edit',
    title: 'The summer edit',
    description: 'Light things for long days: what we pack when the weather turns.',
    products: [
      'relaxed-linen-shirt',
      'everyday-cotton-tee',
      'minimal-leather-sneakers',
      'insulated-steel-bottle',
      'canvas-weekender-bag',
      'linen-throw-blanket',
    ],
  },
  {
    slug: 'gifts-under-50',
    title: 'Gifts under $50',
    products: [
      'leather-card-holder',
      'wool-blend-beanie',
      'ceramic-pour-over-set',
      'oak-desk-organiser',
      'insulated-steel-bottle',
    ],
  },
  { slug: 'new-in', title: 'New in', products: SEEDS.slice(0, 12).map((seed) => seed.slug) },
  { slug: 'workday-carry', title: 'Workday carry', products: ['commuter-backpack-22l'] },
];

export function findCollection(slug: string): CollectionDetail | undefined {
  const seed = COLLECTIONS.find((collection) => collection.slug === slug);
  if (!seed) return undefined;
  const { products, ...collection } = seed;
  return {
    ...collection,
    id: `collection-${seed.slug}`,
    image: picture(`${seed.slug}-cover`, seed.title, 2),
    productCount: products.length,
  };
}

/** The store's collections as a list shows them: without the description. */
export function listCollections(): CollectionSummary[] {
  return COLLECTIONS.flatMap(({ slug }) => {
    const found = findCollection(slug);
    if (!found) return [];
    const { description: _description, ...summary } = found;
    return [summary];
  });
}

/** Whether a product is in any of the collections. */
export function inCollections(productSlug: string, slugs: string[]): boolean {
  return COLLECTIONS.some(
    (collection) => slugs.includes(collection.slug) && collection.products.includes(productSlug)
  );
}
