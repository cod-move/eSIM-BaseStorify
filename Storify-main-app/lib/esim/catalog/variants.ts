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
 * - Day-priced plans (the buyer picks the number of days, priced per day) are
 *   one variant per (data type, allowance). It sells at the primary's price
 *   for its fewest days; the cart line carries the chosen days in
 *   `lineAttributes` (patch point P10) and is priced per day × days.
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
  /** Priced per day for the days the buyer picks; `retailPriceMinor` is then per day. */
  dayPriced: boolean;
  /** The days a day-priced plan can be bought for. */
  minDays: number;
  maxDays: number;
  defaultDays: number;
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
  /** Set on a day-priced variant: the primary's price per day and its range. */
  perDay: PerDayPricing | null;
  /** Plan ids, primary first. */
  candidates: string[];
  sortKey: [number, number, number];
}

export interface PerDayPricing {
  priceMinor: number;
  minDays: number;
  maxDays: number;
  defaultDays: number;
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
  return `${plan.dataType}|${plan.megabytes}|${plan.dayPriced ? "perday" : plan.validityDays}`;
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

/** The Validity value of a day-priced variant: the range the buyer picks from. */
export function dayRangeValue(minDays: number, maxDays: number): string {
  return minDays === maxDays ? validityValue(minDays) : `${minDays}–${maxDays} days`;
}

/** Days clamped to the range; a missing or broken value is the default. */
export function clampDays(days: unknown, range: Omit<PerDayPricing, "priceMinor">): number {
  const value = typeof days === "number" && Number.isInteger(days) ? days : range.defaultDays;
  return Math.min(range.maxDays, Math.max(range.minDays, value));
}

export function planProducts(plans: VariantPlan[]): PlannedProduct[] {
  const products = new Map<string, Map<string, VariantPlan[]>>();
  const destinations = new Map<string, string>();
  for (const plan of plans) {
    if (plan.dayPriced ? plan.minDays < 1 || plan.maxDays < plan.minDays : plan.validityDays < 1) continue;
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
        const perDay: PerDayPricing | null = primary.dayPriced
          ? {
              priceMinor: primary.retailPriceMinor,
              minDays: primary.minDays,
              maxDays: primary.maxDays,
              defaultDays: clampDays(primary.defaultDays, { ...primary, defaultDays: primary.minDays }),
            }
          : null;
        const validity = perDay ? dayRangeValue(perDay.minDays, perDay.maxDays) : validityValue(primary.validityDays);
        return {
          key,
          name: `${data} / ${validity}`,
          dataValue: data,
          validityValue: validity,
          priceMinor: perDay ? perDay.priceMinor * perDay.minDays : primary.retailPriceMinor,
          costUsdMinor: perDay ? primary.costUsdMinor * perDay.minDays : primary.costUsdMinor,
          perDay,
          candidates: ordered.map((plan) => plan.id),
          // A day-priced variant after the fixed ones of the same allowance.
          sortKey: [TYPE_ORDER[primary.dataType], primary.megabytes, perDay ? Number.MAX_SAFE_INTEGER : primary.validityDays],
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
