import {
  byDays,
  keyOf,
  TOPUP_ORDER,
  TYPE_ORDER,
  type SelectorOption,
  type StorefrontVariant,
} from "@/lib/esim/storefront/selector";

/**
 * A destination's plans as filters and a paged list of cards (WEB-13/14):
 * coverage (the country alone, or a region with it) → data kind → days → data → top-up → exit IP → operator. A plan runs on
 * several operators, so it shows under each of them; one that names none
 * shows under "" (not stated). Each filter offers what the
 * other filters leave open, so no choice ends in an empty list; a value the
 * other filters ruled out stays on offer while it is chosen, to be cleared.
 * Pure, so the page and the tests agree.
 */

export const PLAN_FILTERS = ["coverage", "kind", "days", "data", "topup", "breakout", "operator"] as const;
export type PlanFilterKey = (typeof PLAN_FILTERS)[number];
/** The chosen value of each filter; absent is "all". */
export type PlanFilters = Partial<Record<PlanFilterKey, string>>;

/** The data kinds a shopper tells apart: the two daily kinds are one. */
export type DataKind = "total" | "daily" | "unlimited" | "lifetime";

export const dataKindOf = (variant: Pick<StorefrontVariant, "dataType">): DataKind =>
  variant.dataType === "daily_throttled" || variant.dataType === "daily_cutoff" ? "daily" : variant.dataType;

const KIND_ORDER: Record<string, number> = { total: 0, daily: 1, unlimited: 2, lifetime: 3 };

/** A plan's values for each filter: one for most, one per operator for "operator". */
const valuesOf: Record<PlanFilterKey, (variant: StorefrontVariant) => string[]> = {
  coverage: (variant) => [variant.coverageScope ?? "local"],
  kind: (variant) => [dataKindOf(variant)],
  days: (variant) => [keyOf.days(variant)],
  data: (variant) => [keyOf.data(variant)],
  topup: (variant) => [keyOf.topup(variant)],
  breakout: (variant) => [keyOf.breakout(variant)],
  operator: (variant) => (variant.operators?.length ? variant.operators : [""]),
};

/** What a plan costs at the least: a day-priced plan at its fewest days. */
export const lowestPriceMinor = (variant: StorefrontVariant) =>
  variant.perDay ? variant.perDay.priceMinor * variant.perDay.minDays : variant.priceMinor;

function matches(variant: StorefrontVariant, filters: PlanFilters, except?: PlanFilterKey): boolean {
  return PLAN_FILTERS.every((key) => key === except || filters[key] === undefined || valuesOf[key](variant).includes(filters[key]!));
}

function order(key: PlanFilterKey, variants: StorefrontVariant[]) {
  const sample = new Map(variants.map((variant) => [valuesOf[key](variant)[0], variant]));
  return (a: string, b: string) => {
    if (key === "coverage") return Number(a === "multi") - Number(b === "multi");
    if (key === "kind") return (KIND_ORDER[a] ?? 9) - (KIND_ORDER[b] ?? 9);
    if (key === "days") return byDays(a, b);
    if (key === "topup") return (TOPUP_ORDER[a] ?? 9) - (TOPUP_ORDER[b] ?? 9);
    // "Not stated" ("") after the named ones.
    if (key === "operator" || key === "breakout") return Number(a === "") - Number(b === "") || a.localeCompare(b);
    if (key === "data") {
      const va = sample.get(a)!;
      const vb = sample.get(b)!;
      return (TYPE_ORDER[va.dataType] ?? 9) - (TYPE_ORDER[vb.dataType] ?? 9) || va.megabytes - vb.megabytes || a.localeCompare(b);
    }
    return a.localeCompare(b);
  };
}

/** Each filter's values, with the lowest price among the plans each leaves. */
export function planFilterOptions(variants: StorefrontVariant[], filters: PlanFilters): Record<PlanFilterKey, SelectorOption[]> {
  const result = {} as Record<PlanFilterKey, SelectorOption[]>;
  for (const key of PLAN_FILTERS) {
    const cheapest = new Map<string, number>();
    for (const variant of variants) {
      if (!matches(variant, filters, key)) continue;
      for (const value of valuesOf[key](variant)) cheapest.set(value, Math.min(cheapest.get(value) ?? Infinity, lowestPriceMinor(variant)));
    }
    const chosen = filters[key];
    if (chosen !== undefined && !cheapest.has(chosen) && variants.some((variant) => valuesOf[key](variant).includes(chosen))) cheapest.set(chosen, Infinity);
    const sort = order(key, variants);
    result[key] = [...cheapest].map(([value, fromPriceMinor]) => ({ value, fromPriceMinor })).sort((a, b) => sort(a.value, b.value));
  }
  return result;
}

/**
 * The filters once `key` is set to `value` (undefined is "all"): any other
 * filter whose value no plan has alongside it is cleared, so a choice never
 * leaves an empty list.
 */
export function chooseFilter(variants: StorefrontVariant[], filters: PlanFilters, key: PlanFilterKey, value: string | undefined): PlanFilters {
  const next: PlanFilters = { ...filters, [key]: value };
  if (value === undefined) delete next[key];
  // First what cannot go with the new value at all, then, while nothing is left, the rest in order.
  for (const other of PLAN_FILTERS) {
    if (other === key || next[other] === undefined || value === undefined) continue;
    if (!variants.some((variant) => matches(variant, { [key]: value, [other]: next[other] }))) delete next[other];
  }
  for (const other of PLAN_FILTERS) {
    if (other === key || next[other] === undefined) continue;
    if (!variants.some((variant) => matches(variant, next))) delete next[other];
  }
  return next;
}

/** The plans the filters leave, shortest first, then by kind, data and price. */
export function filterPlans(variants: StorefrontVariant[], filters: PlanFilters): StorefrontVariant[] {
  const days = (variant: StorefrontVariant) => (variant.perDay ? Number.MAX_SAFE_INTEGER : (variant.days ?? 0));
  return variants
    .filter((variant) => matches(variant, filters))
    .sort(
      (a, b) =>
        days(a) - days(b) ||
        (TYPE_ORDER[a.dataType] ?? 9) - (TYPE_ORDER[b.dataType] ?? 9) ||
        a.megabytes - b.megabytes ||
        lowestPriceMinor(a) - lowestPriceMinor(b),
    );
}

/** One page of `items`, `page` counted from 1 and kept in range. */
export function pageOf<T>(items: T[], page: number, size: number): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(pages, Math.max(1, Math.floor(page) || 1));
  return { items: items.slice((current - 1) * size, current * size), page: current, pages };
}

