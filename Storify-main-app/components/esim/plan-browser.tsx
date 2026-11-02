"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Globe2, Loader2, MapPin, RefreshCw, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast-notification";
import { useCart } from "@/hooks/use-cart";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { useCurrency } from "@/providers/currency-provider";
import { cn } from "@/lib/utils";
import { FLEX_DAYS, type StorefrontVariant } from "@/lib/esim/storefront/selector";
import {
  chooseFilter,
  dataKindOf,
  filterPlans,
  lowestPriceMinor,
  pageOf,
  PLAN_FILTERS,
  planFilterOptions,
  type PlanFilterKey,
  type PlanFilters,
} from "@/lib/esim/storefront/plan-filter";
import type { CoveredCountry } from "@/lib/esim/storefront/compare";
import { Flag } from "@/components/esim/flag";
import { CoverageDialog } from "@/components/esim/coverage-dialog";
import { PlanBuyDialog } from "@/components/esim/plan-buy-dialog";

/**
 * A destination's plans (WEB-13/14): filters — data kind, days, data, top-up,
 * exit IP — over a paged grid of plan cards. Every filter keeps all its values
 * in place; one that no plan has alongside the other choices is shown faded,
 * and choosing it clears the choices it cannot go with. A card's button puts
 * the plan in the cart; a plan with days or a start date to choose opens a
 * small dialog first. Its coverage opens the countries and their networks.
 */

const PAGE_SIZE = 12;
const SHOWN_FLAGS = 3;
const COLLAPSED_OPTIONS = 12;
/** Fewer hidden than this, and a filter shows them all. */
const MIN_HIDDEN = 3;
const collapses = (count: number) => count - COLLAPSED_OPTIONS >= MIN_HIDDEN;
/** The filters whose values show the lowest price they lead to. */
const PRICED: ReadonlySet<PlanFilterKey> = new Set(["kind", "days", "data"]);

interface PlanBrowserProps {
  productId: string;
  destinationName: string;
  variants: StorefrontVariant[];
  /** The destination's own countries, so an exit IP inside them reads "local". */
  countryCodes: string[];
  /** Exit-IP country names, made on the server in the page's locale. */
  regionNames: Record<string, string>;
  coverage: CoveredCountry[];
  local: boolean;
  image?: string | null;
}

export function PlanBrowser({ productId, destinationName, variants, countryCodes, regionNames, coverage, local, image }: PlanBrowserProps) {
  const t = useFallbackTranslator(useTranslations());
  const { formatPrice } = useCurrency();
  const { addItem } = useCart();
  const [filters, setFilters] = useState<PlanFilters>({});
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState<string | null>(null);
  const [buying, setBuying] = useState<StorefrontVariant | null>(null);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [expanded, setExpanded] = useState<Partial<Record<PlanFilterKey, boolean>>>({});
  // Every value a filter has, and those the other choices leave open (with their lowest price).
  const allValues = useMemo(() => planFilterOptions(variants, {}), [variants]);
  const open = useMemo(() => planFilterOptions(variants, filters), [variants, filters]);
  const plans = useMemo(() => filterPlans(variants, filters), [variants, filters]);
  const shown = pageOf(plans, page, PAGE_SIZE);
  const name = t("esim.page.title", "{name} eSIM", { name: destinationName });

  // A long filter shows its first values, and the chosen one, until opened.
  const visibleValues = (key: PlanFilterKey) => {
    const values = allValues[key].map((option) => option.value);
    if (expanded[key] || !collapses(values.length)) return values;
    const first = values.slice(0, COLLAPSED_OPTIONS);
    const chosen = filters[key];
    return chosen && !first.includes(chosen) ? [...first, chosen] : first;
  };

  const choose = (key: PlanFilterKey, value: string | undefined) => {
    setFilters((current) => chooseFilter(variants, current, key, value));
    setPage(1);
  };

  const days = (variant: StorefrontVariant) =>
    variant.perDay
      ? t("esim.compare.flexDays", "{min}–{max} days", { min: variant.perDay.minDays, max: variant.perDay.maxDays })
      : variant.days === 1
        ? t("esim.selector.oneDay", "1 day")
        : t("esim.selector.nDays", "{days} days", { days: variant.days ?? 0 });
  const topup = (mode: string) =>
    mode === "stack"
      ? t("esim.selector.topupStack", "Top up this plan")
      : mode === "addon"
        ? t("esim.selector.topupAddon", "Add more packages")
        : t("esim.selector.topupNone", "No top-up");
  const breakout = (value: string) => {
    const codes = value ? value.split(",") : [];
    if (!codes.length) return t("esim.selector.ipUnknown", "Standard");
    if (codes.every((code) => countryCodes.includes(code))) return t("esim.selector.ipLocal", "Local IP");
    return codes.map((code) => regionNames[code] ?? code).join(", ");
  };
  const kind = (value: string) =>
    ({
      total: t("esim.plans.kindTotal", "Total data"),
      daily: t("esim.plans.kindDaily", "Daily data"),
      unlimited: t("esim.plans.kindUnlimited", "Unlimited"),
      lifetime: t("esim.plans.kindLifetime", "Long-term"),
    })[value] ?? value;
  const optionLabel: Record<PlanFilterKey, (value: string) => string> = {
    kind,
    days: (value) =>
      value === FLEX_DAYS
        ? t("esim.selector.chooseDays", "Choose days")
        : value === "1"
          ? t("esim.selector.oneDay", "1 day")
          : t("esim.selector.nDays", "{days} days", { days: value }),
    data: (value) => value,
    topup,
    breakout,
  };
  const titles: Record<PlanFilterKey, string> = {
    kind: t("esim.plans.kind", "Data type"),
    days: t("esim.selector.days", "How long is your trip?"),
    data: t("esim.selector.data", "How much data?"),
    topup: t("esim.selector.topup", "Top-up"),
    breakout: t("esim.selector.breakout", "IP address"),
  };

  async function addToCart(variant: StorefrontVariant) {
    if (variant.perDay || variant.scheduledActivation) {
      setBuying(variant);
      return;
    }
    setAdding(variant.variantId);
    try {
      await addItem({ productId, variantId: variant.variantId, quantity: 1, price: variant.priceMinor / 100, name, image: image ?? undefined });
      toast.success(t("esim.selector.added", "Added to cart"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("esim.selector.addFailed", "Could not add to cart"));
    } finally {
      setAdding(null);
    }
  }

  if (!variants.length) {
    return <p className="text-sm text-muted-foreground">{t("esim.selector.none", "No plans are on sale for this destination right now.")}</p>;
  }

  const chosenCount = PLAN_FILTERS.filter((key) => filters[key]).length;
  const coverageLabel = local
    ? (coverage[0]?.name ?? destinationName)
    : t("esim.plans.countries", "{count} countries", { count: coverage.length });

  return (
    <div className="space-y-5">
      <div className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        {PLAN_FILTERS.map((key) => {
          // A filter with one value in all the plans is a fact of every card, not a choice.
          if (allValues[key].length < 2) return null;
          const openPrice = new Map(open[key].map((option) => [option.value, option.fromPriceMinor]));
          return (
            <fieldset key={key} className="space-y-2">
              <legend className="text-sm font-semibold">{titles[key]}</legend>
              <div className="flex flex-wrap gap-2">
                {[undefined, ...visibleValues(key)].map((value) => {
                  const active = filters[key] === value;
                  const price = value === undefined ? undefined : openPrice.get(value);
                  const faded = value !== undefined && (price === undefined || !Number.isFinite(price));
                  return (
                    <button
                      key={value ?? "all"}
                      type="button"
                      aria-pressed={active}
                      onClick={() => choose(key, value)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-start text-sm transition-colors",
                        active ? "border-primary bg-primary/10 font-medium" : "hover:border-foreground/40",
                        faded && !active && "border-dashed text-muted-foreground/70",
                      )}
                    >
                      <span className="block">{value === undefined ? t("esim.plans.all", "All") : optionLabel[key](value)}</span>
                      {PRICED.has(key) && value !== undefined && !faded ? (
                        <span className="block text-xs text-muted-foreground">
                          {t("esim.selector.from", "from {price}", { price: formatPrice(price! / 100) })}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                {collapses(allValues[key].length) ? (
                  <button
                    type="button"
                    onClick={() => setExpanded((current) => ({ ...current, [key]: !current[key] }))}
                    className="self-center px-1 text-sm font-medium text-store-link hover:underline"
                  >
                    {expanded[key]
                      ? t("esim.plans.fewer", "Fewer")
                      : t("esim.plans.more", "+{count} more", { count: allValues[key].length - COLLAPSED_OPTIONS })}
                  </button>
                ) : null}
              </div>
            </fieldset>
          );
        })}
        <div className="flex items-center justify-between gap-3 border-t pt-3 text-sm text-muted-foreground">
          <span>{t("esim.plans.count", "{count} plans", { count: plans.length })}</span>
          {chosenCount ? (
            <button
              type="button"
              className="text-store-link underline-offset-2 hover:underline"
              onClick={() => {
                setFilters({});
                setPage(1);
              }}
            >
              {t("esim.plans.clear", "Clear filters")}
            </button>
          ) : null}
        </div>
      </div>

      {plans.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t("esim.plans.none", "No plans match these filters.")}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.items.map((variant) => (
            <li key={variant.variantId} className="flex flex-col rounded-2xl border bg-card p-4 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="line-clamp-2 text-lg font-bold leading-snug" title={variant.dataValue}>
                    {variant.dataValue}
                  </div>
                  <div className="text-sm text-muted-foreground">{days(variant)}</div>
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{kind(dataKindOf(variant))}</span>
              </div>

              <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                <li className="flex min-w-0 items-center gap-2">
                  <Globe2 className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {t("esim.plans.ip", "IP exit")}: {breakout([...variant.breakoutIp].sort().join(","))}
                  </span>
                </li>
                <li className="flex min-w-0 items-center gap-2">
                  <RefreshCw className="h-4 w-4 shrink-0" />
                  <span className="truncate">{topup(variant.topupMode)}</span>
                </li>
                <li>
                  <button type="button" onClick={() => setCoverageOpen(true)} className="flex w-full min-w-0 items-center gap-2 text-start hover:text-foreground">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span className="flex shrink-0 items-center gap-1">
                      {coverage.slice(0, SHOWN_FLAGS).map((country) => (
                        <Flag key={country.code} code={country.code} />
                      ))}
                    </span>
                    <span className="truncate text-store-link underline-offset-2 hover:underline">
                      {local ? `${coverageLabel} · ${t("esim.plans.networks", "Networks")}` : coverageLabel}
                    </span>
                  </button>
                </li>
              </ul>

              <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3">
                <div className="min-w-0">
                  <div className="text-xl font-bold tabular-nums">
                    {variant.perDay
                      ? t("esim.selector.from", "from {price}", { price: formatPrice(lowestPriceMinor(variant) / 100) })
                      : formatPrice(variant.priceMinor / 100)}
                  </div>
                  {variant.perDay ? (
                    <div className="text-xs text-muted-foreground">
                      {t("esim.plans.perDay", "{price} per day", { price: formatPrice(variant.perDay.priceMinor / 100) })}
                    </div>
                  ) : null}
                </div>
                <Button size="sm" onClick={() => addToCart(variant)} disabled={adding !== null}>
                  {adding === variant.variantId ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : <ShoppingCart className="me-1.5 h-4 w-4" />}
                  {variant.perDay || variant.scheduledActivation ? t("esim.compare.choose", "Choose") : t("common.addToCart", "Add to cart")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {shown.pages > 1 ? (
        <nav className="flex items-center justify-center gap-1" aria-label={t("esim.plans.pages", "Pages")}>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={shown.page <= 1} onClick={() => setPage(shown.page - 1)} aria-label={t("esim.plans.previous", "Previous page")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {Array.from({ length: shown.pages }, (_, index) => index + 1).map((number) => (
            <Button
              key={number}
              variant={number === shown.page ? "default" : "outline"}
              size="sm"
              className="h-8 min-w-8 px-2"
              aria-current={number === shown.page ? "page" : undefined}
              onClick={() => setPage(number)}
            >
              {number}
            </Button>
          ))}
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={shown.page >= shown.pages} onClick={() => setPage(shown.page + 1)} aria-label={t("esim.plans.next", "Next page")}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </nav>
      ) : null}

      <CoverageDialog open={coverageOpen} onOpenChange={setCoverageOpen} title={name} countries={coverage} />
      <PlanBuyDialog
        variant={buying}
        onClose={() => setBuying(null)}
        productId={productId}
        name={name}
        image={image}
        summary={buying ? `${buying.dataValue} · ${days(buying)}` : ""}
      />
    </div>
  );
}
