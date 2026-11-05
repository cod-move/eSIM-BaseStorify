"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays, ChevronLeft, ChevronRight, Database, Globe2, Info, Layers, MapPin, RadioTower, RefreshCw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toast-notification";
import { useCart } from "@/hooks/use-cart";
import { useRouter } from "@/hooks/use-locale-navigation";
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
import { PlanDetailsDialog, type PlanCardLabels } from "@/components/esim/plan-details-dialog";
import { WishlistButton } from "@/components/products/wishlist-button";

/**
 * A destination's plans (WEB-13/14): filters — data kind, days, data, top-up,
 * exit IP — over a paged grid of plan cards. Every filter keeps all its values
 * in place; one that no plan has alongside the other choices is shown faded,
 * and choosing it clears the choices it cannot go with. A card's button (and
 * a click anywhere else on it) opens the plan's details, where it is bought;
 * a plan with days or a start date to choose opens a small dialog first; the
 * heart keeps the destination in the wishlist. Its top-up line explains the
 * top-up rules, and its coverage opens the plan's own countries and networks.
 */

const PAGE_SIZE = 12;
const SHOWN_FLAGS = 3;
const COLLAPSED_OPTIONS = 12;
/** Fewer hidden than this, and a filter shows them all. */
const MIN_HIDDEN = 3;
const collapses = (count: number) => count - COLLAPSED_OPTIONS >= MIN_HIDDEN;
const FILTER_ICONS: Record<PlanFilterKey, LucideIcon> = { kind: Layers, days: CalendarDays, data: Database, topup: RefreshCw, breakout: Globe2, operator: RadioTower };
/** Operators named on a card before "+N". */
const SHOWN_OPERATORS = 3;

interface PlanBrowserProps {
  productId: string;
  destinationName: string;
  variants: StorefrontVariant[];
  /** The destination's own countries, so an exit IP inside them reads "local". */
  countryCodes: string[];
  /** Exit-IP country names, made on the server in the page's locale. */
  regionNames: Record<string, string>;
  coverage: CoveredCountry[];
  /** Each plan's own coverage, by the variant's `coverageSet`; the destination's where missing. */
  planCoverage?: CoveredCountry[][];
  local: boolean;
  image?: string | null;
}

export function PlanBrowser({ productId, destinationName, variants, countryCodes, regionNames, coverage, planCoverage, local, image }: PlanBrowserProps) {
  const t = useFallbackTranslator(useTranslations());
  const { formatPrice } = useCurrency();
  const { addItem } = useCart();
  const router = useRouter();
  const [filters, setFilters] = useState<PlanFilters>({});
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState<string | null>(null);
  const [buying, setBuying] = useState<StorefrontVariant | null>(null);
  const [coverageShown, setCoverageShown] = useState<CoveredCountry[] | null>(null);
  const [details, setDetails] = useState<StorefrontVariant | null>(null);
  const [expanded, setExpanded] = useState<Partial<Record<PlanFilterKey, boolean>>>({});
  // Every value a filter has, and those the other choices leave open.
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
    return chosen !== undefined && !first.includes(chosen) ? [...first, chosen] : first;
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
    if (!codes.length) return t("esim.selector.ipUnknown", "Not specified");
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
    operator: (value) => value || t("esim.selector.ipUnknown", "Not specified"),
  };
  const operatorsLine = (variant: StorefrontVariant) => {
    const names = variant.operators ?? [];
    if (!names.length) return t("esim.selector.ipUnknown", "Not specified");
    return names.slice(0, SHOWN_OPERATORS).join(", ") + (names.length > SHOWN_OPERATORS ? ` +${names.length - SHOWN_OPERATORS}` : "");
  };
  const topupRules = (variant: StorefrontVariant) => {
    if (variant.topupMode === "none") return [t("esim.plans.ruleNone", "This plan cannot be topped up. If you need more, buy another plan.")];
    const rule = variant.topupRule;
    const lines: string[] = [];
    if (variant.topupMode === "addon") lines.push(t("esim.plans.ruleAddon", "Each top-up is a separate package with its own data and validity."));
    else if (rule?.stackTarget === "data") lines.push(t("esim.plans.ruleStackData", "A top-up adds data to this plan; the end date stays the same."));
    else if (rule?.stackTarget === "days") lines.push(t("esim.plans.ruleStackDays", "A top-up extends this plan's validity."));
    else if (rule?.stackTarget === "data_and_days") lines.push(t("esim.plans.ruleStackBoth", "A top-up adds data and extends the validity of this plan."));
    else lines.push(t("esim.plans.ruleStack", "A top-up is added onto this plan."));
    if (rule?.window === "before_expiry") lines.push(t("esim.plans.ruleBeforeExpiry", "Top up before the plan expires; once it has expired, the eSIM can no longer be topped up."));
    if (rule?.window === "while_profile_exists") lines.push(t("esim.plans.ruleAnyTime", "You can top up at any time, even after the current package runs out."));
    if (rule?.retentionDays) lines.push(t("esim.plans.ruleRetention", "If no package is active for {days} days, the network removes the eSIM.", { days: rule.retentionDays }));
    lines.push(t("esim.plans.ruleWhere", "Top up from My eSIMs, on the same eSIM — no new install."));
    return lines;
  };
  const titles: Record<PlanFilterKey, string> = {
    kind: t("esim.plans.kind", "Data type"),
    days: t("esim.selector.days", "How long is your trip?"),
    data: t("esim.selector.data", "How much data?"),
    topup: t("esim.selector.topup", "Top-up"),
    breakout: t("esim.selector.breakout", "IP address"),
    operator: t("esim.plans.operator", "Operator"),
  };

  async function buyNow(variant: StorefrontVariant) {
    if (variant.perDay || variant.scheduledActivation) {
      setBuying(variant);
      return;
    }
    setAdding(variant.variantId);
    try {
      await addItem({ productId, variantId: variant.variantId, quantity: 1, price: variant.priceMinor / 100, name, image: image ?? undefined });
      router.push("/checkout");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("esim.selector.addFailed", "Could not add to cart"));
      setAdding(null);
    }
  }

  if (!variants.length) {
    return <p className="text-sm text-muted-foreground">{t("esim.selector.none", "No plans are on sale for this destination right now.")}</p>;
  }

  const chosenCount = PLAN_FILTERS.filter((key) => filters[key] !== undefined).length;
  // A card shows its own plan's countries and operators.
  const coverageOf = (variant: StorefrontVariant) =>
    (variant.coverageSet !== undefined ? planCoverage?.[variant.coverageSet] : undefined) ?? coverage;
  const coverageLabel = (countries: CoveredCountry[]) =>
    local || countries.length < 2
      ? t("esim.plans.networks", "Networks")
      : t("esim.plans.countries", "{count} countries", { count: countries.length });
  const cardLabels = (variant: StorefrontVariant): PlanCardLabels => ({
    kind: kind(dataKindOf(variant)),
    days: days(variant),
    ip: breakout([...variant.breakoutIp].sort().join(",")),
    topup: topup(variant.topupMode),
    topupRules: topupRules(variant),
    coverage: coverageLabel(coverageOf(variant)),
  });
  const priceOf = (variant: StorefrontVariant) => (
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
  );

  return (
    <div className="space-y-5">
      <div className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        {PLAN_FILTERS.map((key) => {
          // A filter with one value in all the plans is a fact of every card, not a choice.
          if (allValues[key].length < 2) return null;
          const openValues = new Set(open[key].filter((option) => Number.isFinite(option.fromPriceMinor)).map((option) => option.value));
          const Icon = FILTER_ICONS[key];
          return (
            <fieldset key={key} className="space-y-2">
              <legend className="flex items-center gap-1.5 text-sm font-semibold">
                <Icon className="h-4 w-4 text-muted-foreground" />
                {titles[key]}
              </legend>
              <div className="flex flex-wrap gap-2">
                {[undefined, ...visibleValues(key)].map((value) => {
                  const active = filters[key] === value;
                  const faded = value !== undefined && !openValues.has(value);
                  return (
                    <button
                      key={value ?? "all"}
                      type="button"
                      aria-pressed={active}
                      onClick={() => choose(key, value)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                        active ? "border-primary bg-primary/10 font-medium" : "hover:border-foreground/40",
                        faded && !active && "border-dashed text-muted-foreground/70",
                      )}
                    >
                      {value === undefined ? t("esim.plans.all", "All") : optionLabel[key](value)}
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
            <li key={variant.variantId} className="relative flex flex-col rounded-2xl border bg-card p-4 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {/* The title's hit area covers the card: a click anywhere else on it opens the details. */}
                  <button
                    type="button"
                    onClick={() => setDetails(variant)}
                    className="line-clamp-2 text-start text-lg font-bold leading-snug after:absolute after:inset-0 after:rounded-2xl after:content-['']"
                    title={variant.dataValue}
                  >
                    {variant.dataValue}
                  </button>
                  <div className="text-sm text-muted-foreground">{days(variant)}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{kind(dataKindOf(variant))}</span>
                  {variant.details?.speed ? (
                    <span className="rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground/80">{variant.details.speed}</span>
                  ) : null}
                </div>
              </div>

              <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                <li className="flex min-w-0 items-center gap-2">
                  <Globe2 className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {titles.breakout}: {breakout([...variant.breakoutIp].sort().join(","))}
                  </span>
                </li>
                <li className="flex min-w-0 items-center gap-2">
                  <RefreshCw className="h-4 w-4 shrink-0" />
                  <span className="truncate">{topup(variant.topupMode)}</span>
                  <TopupInfo title={t("esim.plans.topupRules", "Top-up rules")} lines={topupRules(variant)} />
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setCoverageShown(coverageOf(variant))}
                    className="group relative z-10 flex max-w-full min-w-0 items-center gap-2 text-start hover:text-foreground"
                  >
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span className="shrink-0">{t("esim.plans.coverageLabel", "Coverage:")}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {coverageOf(variant).slice(0, SHOWN_FLAGS).map((country) => (
                        <Flag key={country.code} code={country.code} />
                      ))}
                    </span>
                    {coverageOf(variant).length > SHOWN_FLAGS ? (
                      <span className="shrink-0 text-store-link underline-offset-2 group-hover:underline">+{coverageOf(variant).length - SHOWN_FLAGS}</span>
                    ) : null}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setCoverageShown(coverageOf(variant))}
                    title={(variant.operators ?? []).join(", ") || undefined}
                    className="group relative z-10 flex max-w-full min-w-0 items-center gap-2 text-start hover:text-foreground"
                  >
                    <RadioTower className="h-4 w-4 shrink-0" />
                    <span className="truncate underline-offset-2 group-hover:underline">
                      {titles.operator}: {operatorsLine(variant)}
                    </span>
                  </button>
                </li>
              </ul>

              <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3">
                {priceOf(variant)}
                <div className="relative z-10 flex shrink-0 items-center gap-1.5">
                  <WishlistButton productId={productId} size="sm" className="shadow-none" />
                  <Button size="sm" variant="outline" className="hover:border-primary hover:text-primary" onClick={() => setDetails(variant)}>
                    {t("esim.plans.viewPlan", "View plan")}
                  </Button>
                </div>
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

      <PlanDetailsDialog
        variant={details}
        onClose={() => setDetails(null)}
        productId={productId}
        labels={details ? cardLabels(details) : null}
        price={details ? priceOf(details) : null}
        coverage={details ? coverageOf(details) : coverage}
        onCoverage={() => details && setCoverageShown(coverageOf(details))}
        onBuy={() => {
          // A plan with a choice left goes on to its own dialog.
          if (details && (details.perDay || details.scheduledActivation)) setDetails(null);
          if (details) buyNow(details);
        }}
        buying={adding !== null}
      />
      <CoverageDialog open={coverageShown !== null} onOpenChange={(next) => !next && setCoverageShown(null)} title={name} countries={coverageShown ?? coverage} />
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

/** An (i) beside the top-up line: the rules show on hover, or on a tap. */
function TopupInfo({ title, lines }: { title: string; lines: string[] }) {
  const [open, setOpen] = useState(false);
  const hover = (next: boolean) => (event: React.PointerEvent) => {
    if (event.pointerType === "mouse") setOpen(next);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        aria-label={title}
        className="relative z-10 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
        onPointerEnter={hover(true)}
        onPointerLeave={hover(false)}
        // A mouse opened it on hover; its click should not close it again.
        onClick={(event) => {
          if (open && (event.nativeEvent as PointerEvent).pointerType === "mouse") event.preventDefault();
        }}
      >
        <Info className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent side="top" className="w-72 p-3 text-sm" onPointerEnter={hover(true)} onPointerLeave={hover(false)}>
        <div className="mb-1.5 font-semibold">{title}</div>
        <ul className="list-disc space-y-1 ps-4 text-muted-foreground">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
