"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { useCurrency } from "@/providers/currency-provider";
import { comparisonRows, PLAN_CHOOSE_EVENT } from "@/lib/esim/storefront/compare";
import type { StorefrontVariant } from "@/lib/esim/storefront/selector";

/**
 * A destination's plans side by side (WEB-14): days, data, top-up, price, and
 * the price per GB and per day. "Choose" selects the plan in the plan
 * selector (it listens for `PLAN_CHOOSE_EVENT`) and scrolls to it.
 */

export function PlanComparison({ variants }: { variants: StorefrontVariant[] }) {
  const t = useFallbackTranslator(useTranslations());
  const { formatPrice } = useCurrency();
  const rows = useMemo(() => comparisonRows(variants), [variants]);
  if (rows.length < 2) return null;

  const days = (variant: StorefrontVariant) =>
    variant.perDay
      ? t("esim.compare.flexDays", "{min}–{max} days", { min: variant.perDay.minDays, max: variant.perDay.maxDays })
      : variant.days === 1
        ? t("esim.selector.oneDay", "1 day")
        : t("esim.selector.nDays", "{days} days", { days: variant.days ?? 0 });
  const topup = (variant: StorefrontVariant) =>
    variant.topupMode === "stack"
      ? t("esim.selector.topupStack", "Top up this plan")
      : variant.topupMode === "addon"
        ? t("esim.selector.topupAddon", "Add more packages")
        : t("esim.selector.topupNone", "No top-up");
  const choose = (variantId: string) => {
    window.dispatchEvent(new CustomEvent(PLAN_CHOOSE_EVENT, { detail: { variantId } }));
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{t("esim.compare.title", "Compare plans")}</h2>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-start text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-start font-medium">{t("esim.compare.days", "Days")}</th>
              <th className="px-3 py-2 text-start font-medium">{t("esim.compare.data", "Data")}</th>
              <th className="hidden px-3 py-2 text-start font-medium sm:table-cell">{t("esim.selector.topup", "Top-up")}</th>
              <th className="px-3 py-2 text-end font-medium">{t("esim.compare.price", "Price")}</th>
              <th className="hidden px-3 py-2 text-end font-medium md:table-cell">{t("esim.compare.perGb", "Per GB")}</th>
              <th className="hidden px-3 py-2 text-end font-medium md:table-cell">{t("esim.compare.perDay", "Per day")}</th>
              <th className="px-3 py-2">
                <span className="sr-only">{t("esim.compare.choose", "Choose")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.variant.variantId} className="border-t">
                <td className="px-3 py-2 whitespace-nowrap">{days(row.variant)}</td>
                <td className="px-3 py-2">{row.variant.dataValue}</td>
                <td className="hidden px-3 py-2 whitespace-nowrap text-muted-foreground sm:table-cell">{topup(row.variant)}</td>
                <td className="px-3 py-2 text-end font-medium tabular-nums whitespace-nowrap">
                  {row.variant.perDay ? t("esim.selector.from", "from {price}", { price: formatPrice(row.priceMinor / 100) }) : formatPrice(row.priceMinor / 100)}
                </td>
                <td className="hidden px-3 py-2 text-end tabular-nums md:table-cell">
                  {row.perGbMinor === null ? "—" : formatPrice(row.perGbMinor / 100)}
                  {row.bestPerGb ? (
                    <span className="mt-1 block w-fit ms-auto whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{t("esim.compare.bestValue", "Best value")}</span>
                  ) : null}
                </td>
                <td className="hidden px-3 py-2 text-end tabular-nums md:table-cell">
                  {row.perDayMinor === null ? "—" : formatPrice(row.perDayMinor / 100)}
                </td>
                <td className="px-3 py-2 text-end">
                  <Button type="button" size="sm" variant="outline" onClick={() => choose(row.variant.variantId)}>
                    {t("esim.compare.choose", "Choose")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
