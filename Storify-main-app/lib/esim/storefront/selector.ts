import type { BillingStart, DataType, TopupMode, TopupStackTarget, TopupWindow } from "@/lib/esim/providers/types";
import type { PerDayPricing } from "@/lib/esim/catalog/variants";

/**
 * The plan selector's steps (WEB-13), pure so the page and the client agree:
 * days → data → top-up kind → exit IP → the variant and its price.
 *
 * Each step offers only what is left after the steps before it, so every
 * combination the shopper can reach is a variant that exists. A choice that a
 * change upstream made impossible falls back to the first option still open.
 */

/** One sellable option of a destination, as the storefront shows it. Serialisable. */
export interface StorefrontVariant {
  variantId: string;
  name: string;
  priceMinor: number;
  dataType: DataType;
  megabytes: number;
  /** "5GB", "Unlimited (3GB/day high speed)", "1GB/day". */
  dataValue: string;
  /** Fixed validity; null for a day-priced variant. */
  days: number | null;
  perDay: PerDayPricing | null;
  topupMode: TopupMode;
  /** How a top-up works, for the card's rules; absent where it cannot be topped up. */
  topupRule?: { stackTarget: TopupStackTarget | null; window: TopupWindow | null; retentionDays: number | null } | null;
  /** Countries the traffic exits from (ISO codes); empty when unknown. */
  breakoutIp: string[];
  /** Which of the destination's `coverageSets` this plan covers (its own countries and operators). */
  coverageSet?: number;
  /** The shopper may pick the day it starts (ORD-03). */
  scheduledActivation?: boolean;
  /** What the plan card's details show; absent where the catalogue did not say. */
  details?: PlanDetails | null;
}

/** One plan's facts for its details dialog; null where the supplier does not say. */
export interface PlanDetails {
  /** The fastest generation, "5G" or "4G". */
  speed: string | null;
  hotspot: boolean | null;
  billingStarts: BillingStart | null;
  /** Days after purchase the eSIM must be installed by. */
  installWithinDays: number | null;
  /** Daily full-speed allowance and the speed after it. */
  highSpeedGbPerDay: number | null;
  reducedSpeedMbps: number | null;
  vpn: boolean;
  voiceMinutes: number;
  smsCount: number;
}

export interface SelectorChoice {
  days?: string;
  data?: string;
  topup?: string;
  breakout?: string;
}

export interface SelectorOption {
  value: string;
  /** Cheapest price among the variants this option leaves open. */
  fromPriceMinor: number;
}

export interface Selection {
  days: SelectorOption[];
  data: SelectorOption[];
  topup: SelectorOption[];
  breakout: SelectorOption[];
  /** The choice as it stands after falling back where needed. */
  choice: Required<SelectorChoice>;
  variant: StorefrontVariant | null;
}

/** "flex" is the day-priced option: the shopper picks the days. */
export const FLEX_DAYS = "flex";

export const keyOf = {
  days: (variant: StorefrontVariant) => (variant.perDay ? FLEX_DAYS : String(variant.days ?? 0)),
  data: (variant: StorefrontVariant) => variant.dataValue,
  topup: (variant: StorefrontVariant) => variant.topupMode,
  breakout: (variant: StorefrontVariant) => [...variant.breakoutIp].sort().join(","),
};

const STEPS = ["days", "data", "topup", "breakout"] as const;
type Step = (typeof STEPS)[number];

function options(variants: StorefrontVariant[], step: Step, order: (a: string, b: string) => number): SelectorOption[] {
  const cheapest = new Map<string, number>();
  for (const variant of variants) {
    const value = keyOf[step](variant);
    cheapest.set(value, Math.min(cheapest.get(value) ?? Infinity, variant.priceMinor));
  }
  return [...cheapest].map(([value, fromPriceMinor]) => ({ value, fromPriceMinor })).sort((a, b) => order(a.value, b.value));
}

export const byDays = (a: string, b: string) =>
  a === FLEX_DAYS ? 1 : b === FLEX_DAYS ? -1 : Number(a) - Number(b);
export const TOPUP_ORDER: Record<string, number> = { stack: 0, addon: 1, none: 2 };
/** As the product's variants are ordered (lib/esim/catalog/variants.ts). */
export const TYPE_ORDER: Record<string, number> = { total: 0, daily_throttled: 1, daily_cutoff: 2, unlimited: 3, lifetime: 4 };

export function resolveSelection(variants: StorefrontVariant[], choice: SelectorChoice = {}): Selection {
  let open = variants;
  const result = { choice: {} as Required<SelectorChoice> } as Selection;
  for (const step of STEPS) {
    const order =
      step === "days"
        ? byDays
        : step === "data"
          ? (a: string, b: string) => {
              const va = open.find((variant) => keyOf.data(variant) === a)!;
              const vb = open.find((variant) => keyOf.data(variant) === b)!;
              return (
                (TYPE_ORDER[va.dataType] ?? 9) - (TYPE_ORDER[vb.dataType] ?? 9) ||
                va.megabytes - vb.megabytes ||
                a.localeCompare(b)
              );
            }
          : step === "topup"
            ? (a: string, b: string) => (TOPUP_ORDER[a] ?? 9) - (TOPUP_ORDER[b] ?? 9)
            : (a: string, b: string) => a.localeCompare(b);
    const stepOptions = options(open, step, order);
    result[step] = stepOptions;
    const wanted = choice[step];
    const picked = stepOptions.find((option) => option.value === wanted) ?? stepOptions[0];
    result.choice[step] = picked?.value ?? "";
    open = picked ? open.filter((variant) => keyOf[step](variant) === picked.value) : [];
  }
  result.variant = [...open].sort((a, b) => a.priceMinor - b.priceMinor)[0] ?? null;
  return result;
}

/** The lowest price a destination sells from: a day-priced variant counts at its fewest days. */
export function fromPriceMinor(variants: StorefrontVariant[]): number | null {
  const prices = variants.map((variant) =>
    variant.perDay ? variant.perDay.priceMinor * variant.perDay.minDays : variant.priceMinor,
  );
  return prices.length ? Math.min(...prices) : null;
}
