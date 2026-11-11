import { dataKindOf, PLAN_FILTERS, planFilterOptions, type PlanFilterKey } from "@/lib/esim/storefront/plan-filter";
import { FLEX_DAYS, keyOf, type StorefrontVariant } from "@/lib/esim/storefront/selector";

/**
 * A destination's plan filters for the shopper app (APP-02), the website's
 * (lib/esim/storefront/plan-filter.ts, components/esim/plan-browser.tsx):
 * each plan's values under every filter, and each filter's title and values
 * in order with the words the website shows. The app narrows the list itself,
 * with the same rule: each filter offers what the others leave open. A filter
 * whose plans all share one value is a fact of every card and is left out.
 * Pure.
 */

export type Translate = (key: string, fallback: string, values?: Record<string, string | number>) => string;

export type PlanFacets = Partial<Record<PlanFilterKey, string[]>>;
export type PlanFilterView = { key: PlanFilterKey; title: string; options: Array<{ value: string; label: string }> };

export function planFacets(variant: StorefrontVariant): PlanFacets {
  return {
    coverage: [variant.coverageScope ?? "local"],
    kind: [dataKindOf(variant)],
    days: [keyOf.days(variant)],
    data: [keyOf.data(variant)],
    topup: [keyOf.topup(variant)],
    breakout: [keyOf.breakout(variant)],
    operator: variant.operators?.length ? variant.operators : [""],
  };
}

export function planFilterViews(
  variants: StorefrontVariant[],
  { t, countryCodes, regionNames }: { t: Translate; countryCodes: string[]; regionNames: Record<string, string> },
): PlanFilterView[] {
  const unknown = t("esim.selector.ipUnknown", "Not specified");
  const titles: Record<PlanFilterKey, string> = {
    coverage: t("esim.plans.coverage", "Coverage"),
    kind: t("esim.plans.kind", "Data type"),
    days: t("esim.selector.days", "How long is your trip?"),
    data: t("esim.selector.data", "How much data?"),
    topup: t("esim.selector.topup", "Top-up"),
    breakout: t("esim.selector.breakout", "IP address"),
    operator: t("esim.plans.operator", "Operator"),
  };
  const kinds: Record<string, string> = {
    total: t("esim.plans.kindTotal", "Total data"),
    daily: t("esim.plans.kindDaily", "Daily data"),
    unlimited: t("esim.plans.kindUnlimited", "Unlimited"),
    lifetime: t("esim.plans.kindLifetime", "Long-term"),
  };
  const label: Record<PlanFilterKey, (value: string) => string> = {
    coverage: (value) => (value === "multi" ? t("esim.plans.coverageMulti", "Region") : t("esim.plans.coverageLocal", "Single country/area")),
    kind: (value) => kinds[value] ?? value,
    days: (value) =>
      value === FLEX_DAYS
        ? t("esim.selector.chooseDays", "Choose days")
        : value === "1"
          ? t("esim.selector.oneDay", "1 day")
          : t("esim.selector.nDays", "{days} days", { days: value }),
    data: (value) => value,
    topup: (value) =>
      value === "stack"
        ? t("esim.selector.topupStack", "Top up this plan")
        : value === "addon"
          ? t("esim.selector.topupAddon", "Add more packages")
          : t("esim.selector.topupNone", "No top-up"),
    breakout: (value) => {
      const codes = value ? value.split(",") : [];
      if (!codes.length) return unknown;
      if (countryCodes.length === 1 && codes.length === 1 && codes[0] === countryCodes[0]) return t("esim.selector.ipLocal", "Local IP");
      return codes.map((code) => regionNames[code] ?? code).join(", ");
    },
    operator: (value) => value || unknown,
  };

  const all = planFilterOptions(variants, {});
  return PLAN_FILTERS.filter((key) => all[key].length > 1).map((key) => ({
    key,
    title: titles[key],
    options: all[key].map((option) => ({ value: option.value, label: label[key](option.value) })),
  }));
}
