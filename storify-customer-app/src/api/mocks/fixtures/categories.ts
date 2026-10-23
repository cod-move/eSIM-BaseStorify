/** The mock store's categories. */
import type { Category } from '@/contracts/mobile/shop/v1';

import { picture } from './shared';

type Branch = { slug: string; name: string; children?: Branch[] };

export const CATEGORIES: Branch[] = [
  { slug: 'clothing', name: 'Clothing' },
  { slug: 'shoes', name: 'Shoes' },
  { slug: 'bags', name: 'Bags' },
  {
    slug: 'electronics',
    name: 'Electronics',
    children: [
      {
        slug: 'phones',
        name: 'Phones',
        children: [
          { slug: 'smartphones', name: 'Smartphones' },
          { slug: 'feature-phones', name: 'Feature Phones' },
        ],
      },
      { slug: 'laptops', name: 'Laptops' },
      { slug: 'headphones', name: 'Headphones' },
    ],
  },
  { slug: 'home', name: 'Home' },
  { slug: 'accessories', name: 'Accessories' },
  { slug: 'digital', name: 'Digital' },
];

function toCategory(branch: Branch): Category {
  return {
    id: `cat_${branch.slug}`,
    slug: branch.slug,
    name: branch.name,
    image: picture(`category-${branch.slug}`, branch.name),
    children: (branch.children ?? []).map(toCategory),
  };
}

export function categoryTree(): Category[] {
  return CATEGORIES.map(toCategory);
}

function withDescendants(branch: Branch): string[] {
  return [branch.slug, ...(branch.children ?? []).flatMap(withDescendants)];
}

function find(branches: Branch[], slug: string): Branch | undefined {
  for (const branch of branches) {
    if (branch.slug === slug) return branch;
    const inside = find(branch.children ?? [], slug);
    if (inside) return inside;
  }
  return undefined;
}

/** Each of the categories and everything beneath it: a parent's list holds its descendants' products. */
export function categoryScope(slugs: string[]): Set<string> {
  return new Set(
    slugs.flatMap((slug) => withDescendants(find(CATEGORIES, slug) ?? { slug, name: slug }))
  );
}
