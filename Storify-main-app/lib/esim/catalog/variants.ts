import type { DataType } from "@/lib/esim/providers/types";

/**
 * Plans → storefront products and variants (CAT-05/06). Pure.
 *
 * - One product per `productSlug` (a destination), across suppliers.
 * - One variant per (data type, allowance, days, networks, exit IP): the same
 *   5GB/30-day plan from two suppliers is one thing to the shopper only when
 *   it runs on the same networks and exits from the same place; otherwise
 *   they are separate variants, told apart by a third option (operators or
 *   IP). A supplier that does not say counts as its own kind. Its candidates are the
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
  /** The operators it runs on; empty when the supplier does not say. */
  networks: Array<{ countryCode: string; operator: string; network: string | null }>;
  /** Countries the traffic exits from; empty when the supplier does not say. */
  breakoutIp: string[];
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
  /**
   * What tells it from another variant of the same data and days (other
   * networks or exit IP), "Maxis, U Mobile" or "IP SG"; null when nothing
   * else shares its data and days.
   */
  distinction: string | null;
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

/** Data type, allowance and days: what a variant was keyed by before networks and IP counted (old admin pins). */
export function baseVariantKey(plan: VariantPlan): string {
  return `${plan.dataType}|${plan.megabytes}|${plan.dayPriced ? "perday" : plan.validityDays}`;
}

/** The operators a plan runs on, as one comparable string ("" when unknown). */
export function networkSignature(networks: VariantPlan["networks"]): string {
  return [...new Set(networks.map((entry) => `${entry.countryCode.toUpperCase()}:${entry.operator.trim().toLowerCase()}:${(entry.network ?? "").trim().toUpperCase()}`))]
    .sort()
    .join("|");
}

/** The exit-IP countries, as one comparable string ("" when unknown). */
export const ipSignature = (breakoutIp: string[]) => [...new Set(breakoutIp.map((code) => code.trim().toUpperCase()).filter(Boolean))].sort().join(",");

/** A short stable hash (FNV-1a, 8 hex), so a key stays short however many networks. */
function shortHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function variantKey(plan: VariantPlan): string {
  const networks = networkSignature(plan.networks);
  const ip = ipSignature(plan.breakoutIp);
  return `${baseVariantKey(plan)}|n:${networks ? shortHash(networks) : "-"}|ip:${ip || "-"}`;
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

/**
 * @param pins per product slug, per variant key: the plan an admin pinned as
 *   primary (ADM-06). A pinned plan still on sale goes first, ahead of the
 *   cheapest, and the variant takes its price.
 */
export function planProducts(plans: VariantPlan[], pins: ReadonlyMap<string, ReadonlyMap<string, string>> = new Map()): PlannedProduct[] {
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
    variants: distinguish(mergeSameName([...variants]
      .map(([key, candidates]): Grouped => {
        // A pin made before networks and IP counted still applies (only to its own plan).
        const pinned = pins.get(productSlug)?.get(key) ?? pins.get(productSlug)?.get(baseVariantKey(candidates[0]));
        const ordered = [...candidates].sort(
          (a, b) =>
            Number(b.id === pinned) - Number(a.id === pinned) ||
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
          distinction: null,
          networkKey: networkSignature(primary.networks),
          ipKey: ipSignature(primary.breakoutIp),
          operators: [...new Set(primary.networks.map((entry) => entry.operator.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
          operatorsWithGeneration: withGeneration(primary.networks),
          // A day-priced variant after the fixed ones of the same allowance.
          sortKey: [TYPE_ORDER[primary.dataType], primary.megabytes, perDay ? Number.MAX_SAFE_INTEGER : primary.validityDays],
        };
      })
      .sort((a, b) => a.sortKey[0] - b.sortKey[0] || a.sortKey[1] - b.sortKey[1] || a.sortKey[2] - b.sortKey[2]))),
  }));
}

/** A variant while it is being planned: with what tells it apart from its namesakes. */
interface Grouped extends PlannedVariant {
  networkKey: string;
  ipKey: string;
  operators: string[];
  /** "NTT docomo 5G": each operator with its fastest generation, where stated. */
  operatorsWithGeneration: string[];
}

const SHOWN_OPERATORS = 3;

const operatorLabel = (operators: string[]) =>
  operators.length
    ? operators.slice(0, SHOWN_OPERATORS).join(", ") + (operators.length > SHOWN_OPERATORS ? ` +${operators.length - SHOWN_OPERATORS}` : "")
    : "Networks not stated";

const GENERATIONS = ["5G", "4G", "LTE", "3G", "2G"];

/** Each operator once, with the fastest generation it is listed on. */
function withGeneration(networks: VariantPlan["networks"]): string[] {
  const fastest = new Map<string, number>();
  for (const entry of networks) {
    const operator = entry.operator.trim();
    if (!operator) continue;
    const found = GENERATIONS.findIndex((generation) => (entry.network ?? "").toUpperCase().includes(generation));
    const rank = found === -1 ? GENERATIONS.length : found;
    fastest.set(operator, Math.min(fastest.get(operator) ?? GENERATIONS.length, rank));
  }
  return [...fastest]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([operator, rank]) => (rank < GENERATIONS.length ? `${operator} ${GENERATIONS[rank]}` : operator));
}

/**
 * Variants with the same data and days but other networks or exit IP get a
 * distinction, and it goes into their name ("5GB / 30 days (Maxis, U Mobile)"),
 * so the shopper and the store's variant list can tell them apart.
 */
function distinguish(variants: Grouped[]): PlannedVariant[] {
  const byName = new Map<string, Grouped[]>();
  for (const variant of variants) byName.set(variant.name, [...(byName.get(variant.name) ?? []), variant]);
  const used = new Set<string>();
  return variants.map(({ networkKey: _networkKey, ipKey: _ipKey, operators: _operators, operatorsWithGeneration: _withGeneration, ...variant }, index) => {
    const namesakes = byName.get(variant.name)!;
    if (namesakes.length < 2) return variant;
    const self = variants[index];
    const others = namesakes.filter((entry) => entry !== self);
    // Name the networks where they are what sets it apart from a namesake with the same exit IP,
    // and the IP where it sets it apart from one on the same networks; both when neither alone does.
    const byNetworks = others.some((entry) => entry.ipKey === self.ipKey && entry.networkKey !== self.networkKey);
    const byIp = others.some((entry) => entry.networkKey === self.networkKey && entry.ipKey !== self.ipKey);
    const both = !byNetworks && !byIp;
    const parts: string[] = [];
    if (byNetworks || both) {
      // The same operators on another generation ("NTT docomo 5G" / "NTT docomo 4G") are named with it.
      const plain = operatorLabel(self.operators);
      const sameNames = others.some((entry) => entry.networkKey !== self.networkKey && operatorLabel(entry.operators) === plain);
      parts.push(sameNames ? operatorLabel(self.operatorsWithGeneration) : plain);
    }
    if (byIp || both) parts.push(self.ipKey ? `IP ${self.ipKey.replace(/,/g, "+")}` : "IP not stated");
    // " / " splits the name into data and days elsewhere; keep it out.
    const base = (parts.join(", ") || "Option").replace(/\s*\/\s*/g, "/");
    let distinction = base;
    for (let count = 2; used.has(`${variant.name}#${distinction}`); count += 1) distinction = `${base} #${count}`;
    used.add(`${variant.name}#${distinction}`);
    return { ...variant, distinction, name: `${variant.name} (${distinction})` };
  });
}

/**
 * Two bundles the shopper cannot tell apart (1000MB and 1024MB both read
 * "1GB", on the same networks and exit IP) must not become two variants with
 * the same options; the first keeps its price and the other's plans become
 * further fallbacks.
 */
function mergeSameName(variants: Grouped[]): Grouped[] {
  const byName = new Map<string, Grouped>();
  for (const variant of variants) {
    const same = `${variant.name}#${variant.networkKey}#${variant.ipKey}`;
    const kept = byName.get(same);
    if (kept) kept.candidates = [...kept.candidates, ...variant.candidates];
    else byName.set(same, { ...variant, candidates: [...variant.candidates] });
  }
  return [...byName.values()];
}
