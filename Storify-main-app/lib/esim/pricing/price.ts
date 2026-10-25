import type { CoverageScope } from "@/lib/esim/providers/types";

/**
 * Plan cost → selling price in the store currency (USD), CAT-07. Pure, so the
 * whole policy is unit-tested; the service around it only loads and saves.
 *
 *   costUsd = cost × usdPerUnit × (1 + fxBuffer%)
 *   price   = max(costUsd × (1 + markup%) + fixedMarkup, costUsd × (1 + minMargin%))
 *   then rounded UP to the configured ending, so rounding never eats margin.
 *
 * All money is integer cents; fractional cents exist only mid-calculation.
 */

export type RoundingMode = "none" | "99" | "49_99";

export interface PricingSettings {
  fxBufferPercent: number;
  defaultMarkupPercent: number;
  minMarginPercent: number;
  rounding: RoundingMode;
}

export interface PricingRule {
  id: string;
  /** null = any. The more criteria a rule names, the more specific it is. */
  providerCode: string | null;
  countryCode: string | null;
  scope: CoverageScope | null;
  markupPercent: number;
  fixedMarkupMinor: number;
  /** Breaks ties between equally specific rules; higher wins. */
  priority: number;
}

export interface PricedPlanInput {
  providerCode: string;
  scope: CoverageScope;
  countryCodes: string[];
  costMinor: number;
  usdPerUnit: number;
}

export interface PriceResult {
  retailMinor: number;
  costUsdMinor: number;
  ruleId: string | null;
  markupPercent: number;
  /** True when the minimum margin, not the markup, set the price. */
  marginFloorApplied: boolean;
}

function specificity(rule: PricingRule) {
  return Number(rule.providerCode !== null) + Number(rule.countryCode !== null) + Number(rule.scope !== null);
}

/**
 * The most specific rule that matches; a country rule matches a local plan of
 * that country only — a regional plan covering it is not "that country's".
 */
export function matchRule(rules: PricingRule[], plan: PricedPlanInput): PricingRule | null {
  const country = plan.scope === "local" ? plan.countryCodes[0] ?? null : null;
  const matching = rules.filter(
    (rule) =>
      (rule.providerCode === null || rule.providerCode === plan.providerCode) &&
      (rule.scope === null || rule.scope === plan.scope) &&
      (rule.countryCode === null || rule.countryCode === country),
  );
  matching.sort((a, b) => specificity(b) - specificity(a) || b.priority - a.priority);
  return matching[0] ?? null;
}

export function roundUp(minor: number, mode: RoundingMode): number {
  const cents = Math.ceil(minor - 1e-9);
  if (mode === "none") return cents;
  const endings = mode === "99" ? [99] : [49, 99];
  const dollars = Math.floor(cents / 100);
  for (const base of [dollars, dollars + 1]) {
    for (const ending of endings) {
      const candidate = base * 100 + ending;
      if (candidate >= cents) return candidate;
    }
  }
  return cents;
}

export function priceOf(
  plan: PricedPlanInput,
  rules: PricingRule[],
  settings: PricingSettings,
): PriceResult {
  if (!(plan.usdPerUnit > 0)) throw new Error("No exchange rate for the plan's currency");
  const costUsd = plan.costMinor * plan.usdPerUnit * (1 + settings.fxBufferPercent / 100);
  const rule = matchRule(rules, plan);
  const markupPercent = rule?.markupPercent ?? settings.defaultMarkupPercent;
  const marked = costUsd * (1 + markupPercent / 100) + (rule?.fixedMarkupMinor ?? 0);
  const floor = costUsd * (1 + settings.minMarginPercent / 100);
  return {
    retailMinor: roundUp(Math.max(marked, floor), settings.rounding),
    costUsdMinor: Math.round(costUsd),
    ruleId: rule?.id ?? null,
    markupPercent,
    marginFloorApplied: floor > marked,
  };
}
