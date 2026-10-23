/** The mock store's comparison: the products' cards and their specifications lined up in rows. */
import { COMPARE_MAX_PRODUCTS, type ProductComparison } from '@/contracts/mobile/shop/v1';

import { findProduct } from './product';
import { SEEDS, toCard } from './products';

/** What a product says about itself: its specifications, and the options it is sold in. */
function specsOf(slug: string, locale: string): { name: string; value: string }[] {
  const product = findProduct(slug, locale);
  if (!product) return [];
  return [
    ...product.attributes,
    ...product.options
      .filter((option) => option.values.length > 0)
      .map((option) => ({
        name: option.name,
        value: option.values.map((v) => v.label).join(', '),
      })),
  ];
}

/**
 * The slugs of `?products=`, as the store reads them: each once, in order, no
 * more than a comparison holds; one the store does not have is left out.
 */
export function compareProducts(slugs: string[], locale: string): ProductComparison {
  const wanted = Array.from(new Set(slugs.map((slug) => slug.trim()).filter(Boolean))).slice(
    0,
    COMPARE_MAX_PRODUCTS
  );
  const seeds = wanted.flatMap((slug) => SEEDS.filter((seed) => seed.slug === slug));
  const specs = seeds.map((seed) => specsOf(seed.slug, locale));

  const labels: string[] = [];
  for (const list of specs) {
    for (const { name } of list) if (!labels.includes(name)) labels.push(name);
  }

  return {
    items: seeds.map((seed) => toCard(seed, locale)),
    rows: labels.map((label) => ({
      label,
      values: specs.map((list) => list.find((spec) => spec.name === label)?.value ?? ''),
    })),
  };
}
