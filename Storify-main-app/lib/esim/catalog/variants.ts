import type { DataType } from "@/lib/esim/providers/types";

/**
 * Plans → storefront products and variants (CAT-05/06). Pure.
 *
 * - One product per `productSlug` (a destination), across suppliers.
 * - One variant per (data type, allowance, days): the same 5GB/30-day plan
 *   from two suppliers is one thing to the shopper. Its candidates are the
 *   supplier plans that can fulfil it, primary first: lowest selling price,
 *   then lowest USD cost, then lower supplier priority number (decided
 *   2026-10-25). The variant sells at the primary's price.
 * - Day-priced plans (buyer picks the number of days) are left out until order
 *   lines can carry the chosen days (patch point P10).
 */

export interface VariantPlan {
  id: string;
  providerCode: string;
  providerPriority: number;
  productSlug: string;
  destination: string;
  dataType: DataType;
  megabytes: number;
  dataLabel: string;
  validityDays: number;
  dayPriced: boolean;
  retailPriceMinor: number;
  costUsdMinor: number;
  highSpeedGbPerDay: number | null;
}

export interface PlannedVariant {
  key: string;
  name: string;
  dataValue: string;
  validityValue: string;
  priceMinor: number;
  costUsdMinor: number;
  /** Plan ids, primary first. */
  candidates: string[];
  sortKey: [number, number, number];
}

export interface PlannedProduct {
  productSlug: string;
  destination: string;
  variants: PlannedVariant[];
}

const TYPE_ORDER: Record<DataType, number> = {
  total: 0,
  daily_throttled: 1,
  daily_cutoff: 2,
  unlimited: 3,
  lifetime: 4,
};

export function variantKey(plan: VariantPlan): string {
  return `${plan.dataType}|${plan.megabytes}|${plan.validityDays}`;
}

export function dataValue(plan: VariantPlan): string {
  switch (plan.dataType) {
    case "unlimited":
      return plan.highSpeedGbPerDay ? `Unlimited (${plan.highSpeedGbPerDay}GB/day high speed)` : "Unlimited";
    case "daily_throttled":
      return `${plan.dataLabel}/day, then reduced speed`;
    case "daily_cutoff":
      return `${plan.dataLabel}/day`;
    case "lifetime":
      return `${plan.dataLabel} (no expiry)`;
    default:
      return plan.dataLabel;
  }
}

export function validityValue(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

export function planProducts(plans: VariantPlan[]): PlannedProduct[] {
  const products = new Map<string, Map<string, VariantPlan[]>>();
  const destinations = new Map<string, string>();
  for (const plan of plans) {
    if (plan.dayPriced || plan.validityDays < 1) continue;
    const variants = products.get(plan.productSlug) ?? new Map<string, VariantPlan[]>();
    const key = variantKey(plan);
    variants.set(key, [...(variants.get(key) ?? []), plan]);
    products.set(plan.productSlug, variants);
    if (!destinations.has(plan.productSlug)) destinations.set(plan.productSlug, plan.destination);
  }

  return [...products].map(([productSlug, variants]) => ({
    productSlug,
    destination: destinations.get(productSlug) ?? productSlug,
    variants: mergeSameName([...variants]
      .map(([key, candidates]): PlannedVariant => {
        const ordered = [...candidates].sort(
          (a, b) =>
            a.retailPriceMinor - b.retailPriceMinor ||
            a.costUsdMinor - b.costUsdMinor ||
            a.providerPriority - b.providerPriority ||
            a.id.localeCompare(b.id),
        );
        const primary = ordered[0];
        const data = dataValue(primary);
        const validity = validityValue(primary.validityDays);
        return {
          key,
          name: `${data} / ${validity}`,
          dataValue: data,
          validityValue: validity,
          priceMinor: primary.retailPriceMinor,
          costUsdMinor: primary.costUsdMinor,
          candidates: ordered.map((plan) => plan.id),
          sortKey: [TYPE_ORDER[primary.dataType], primary.megabytes, primary.validityDays],
        };
      })
      .sort((a, b) => a.sortKey[0] - b.sortKey[0] || a.sortKey[1] - b.sortKey[1] || a.sortKey[2] - b.sortKey[2])),
  }));
}

/**
 * Two bundles the shopper cannot tell apart (1000MB and 1024MB both read
 * "1GB") must not become two variants with the same options; the first keeps
 * its price and the other's plans become further fallbacks.
 */
function mergeSameName(variants: PlannedVariant[]): PlannedVariant[] {
  const byName = new Map<string, PlannedVariant>();
  for (const variant of variants) {
    const kept = byName.get(variant.name);
    if (kept) kept.candidates = [...kept.candidates, ...variant.candidates];
    else byName.set(variant.name, { ...variant, candidates: [...variant.candidates] });
  }
  return [...byName.values()];
}
