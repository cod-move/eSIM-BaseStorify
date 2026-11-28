"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast-notification";
import { useCart } from "@/hooks/use-cart";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { useCurrency } from "@/providers/currency-provider";
import { daysPriceMinor, type DayDiscount } from "@/lib/esim/pricing/day-discount";
import { DayStepper } from "./day-stepper";

export interface TopupPickerOffer {
  topupPlanId: string;
  name: string;
  megabytes: number;
  validityDays: number;
  priceMinor: number;
  area?: string | null;
  sameArea?: boolean;
  dayGroup?: string | null;
  /** A day pass taken for the days the shopper picks: `priceMinor` here is per day. */
  perDay?: { priceMinor: number; minDays: number; maxDays: number; defaultDays: number; discounts?: DayDiscount[] } | null;
}

/** One card: an offer, or a day-pass with the day counts it is sold for. */
interface TopupCard {
  key: string;
  name: string;
  area: string | null;
  options: TopupPickerOffer[];
}

/** Offers as cards, a day-pass's day counts folded into one, fewest days first. */
function cardsOf(offers: TopupPickerOffer[]): TopupCard[] {
  const cards = new Map<string, TopupCard>();
  for (const offer of offers) {
    const key = offer.dayGroup || offer.topupPlanId;
    const card = cards.get(key);
    if (card) card.options.push(offer);
    else cards.set(key, { key, name: offer.dayGroup ? offer.name.replace(/\s*×\s*\d+\s*days?$/i, "") : offer.name, area: offer.area ?? null, options: [offer] });
  }
  for (const card of cards.values()) card.options.sort((a, b) => a.validityDays - b.validityDays);
  return [...cards.values()];
}

/** Top-ups on one page. */
const PAGE_SIZE = 10;

function dataLabel(megabytes: number) {
  if (megabytes >= 1024) return `${Number((megabytes / 1024).toFixed(megabytes % 1024 ? 1 : 0))} GB`;
  return `${megabytes} MB`;
}

/**
 * The top-ups an eSIM can take (TOP-02/03). Picking one asks the server for a
 * quote, puts it in the cart as the top-up product's line and goes to
 * checkout, where it is paid like anything else (balance or a gateway). The
 * cart sets its other lines aside first: a top-up is paid on its own
 * (lib/esim/wallet/park.ts), and they come back after.
 */
export interface TopupPickerArea {
  id: string;
  name: string;
  count: number;
  fromPriceMinor: number;
}

/** Areas listed at once on the "other regions" tab; search finds the rest. */
const AREAS_SHOWN = 30;

export function EsimTopupPicker({ esimId, offers, otherAreas = [] }: { esimId: string; offers: TopupPickerOffer[]; otherAreas?: TopupPickerArea[] }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const { addItem } = useCart();
  const { formatPrice } = useCurrency();
  // A plan that tops up any area: renewing this same plan first, plans for other areas on a tab of their own.
  // Those come as a list of areas (a supplier may have thousands of top-ups); an area's are fetched when chosen.
  const hasOther = otherAreas.length > 0;
  const hasOwn = offers.length > 0;
  const [tab, setTab] = useState<"own" | "other">(hasOwn ? "own" : "other");
  const [area, setArea] = useState<TopupPickerArea | null>(null);
  const [areaOffers, setAreaOffers] = useState<TopupPickerOffer[]>([]);
  const [loadingArea, setLoadingArea] = useState(false);
  const [areaQuery, setAreaQuery] = useState("");
  const onTab = tab === "own" ? offers : area ? areaOffers : [];
  const [selected, setSelected] = useState<string | null>(offers[0]?.topupPlanId ?? null);
  const areaWords = areaQuery.toLowerCase().split(/\s+/).filter(Boolean);
  const areasMatching = otherAreas.filter((entry) => areaWords.every((word) => entry.name.toLowerCase().includes(word)));
  const [busy, setBusy] = useState(false);
  // The days picked for each day pass, by offer; its default days until then.
  const [dayChoice, setDayChoice] = useState<Record<string, number>>({});
  const daysOf = (offer: TopupPickerOffer) => (offer.perDay ? (dayChoice[offer.topupPlanId] ?? offer.perDay.defaultDays) : offer.validityDays);
  const priceOf = (offer: TopupPickerOffer) => (offer.perDay ? daysPriceMinor(offer.perDay.priceMinor, daysOf(offer), offer.perDay.discounts) : offer.priceMinor);
  // A supplier like BNESIM offers top-ups for other regions too: many of them, so in pages.
  const [page, setPage] = useState(0);
  // Search by name, data ("5 GB", "500MB") or days ("7"), every word must match.
  const [query, setQuery] = useState("");
  const words = query.toLowerCase().replace(/(\d)\s*(gb|mb|days?|天)/g, "$1$2").split(/\s+/).filter(Boolean);
  const matchingOffers = words.length
    ? onTab.filter((offer) => {
        const text = `${offer.area ?? ""} ${offer.name} ${dataLabel(offer.megabytes).replace(" ", "")} ${offer.validityDays}days ${offer.validityDays}day ${offer.validityDays}天 ${offer.validityDays}`.toLowerCase();
        return words.every((word) => text.includes(word));
      })
    : onTab;
  const matching = cardsOf(matchingOffers);
  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const shown = matching.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  async function openArea(entry: TopupPickerArea) {
    const failed = t("esim.topup.supplierDown", "We could not load the top-ups for this eSIM right now. Please try again in a few minutes.");
    setArea(entry);
    setAreaOffers([]);
    setSelected(null);
    setQuery("");
    setPage(0);
    setLoadingArea(true);
    try {
      const response = await fetch(`/api/esim/me/esims/${esimId}/topup?area=${encodeURIComponent(entry.id)}`);
      const body = (await response.json().catch(() => ({}))) as { data?: { offers?: TopupPickerOffer[] } };
      const list = body.data?.offers ?? [];
      setAreaOffers(list);
      setSelected(list[0]?.topupPlanId ?? null);
      if (!response.ok) toast.error(failed);
    } catch {
      toast.error(failed);
    } finally {
      setLoadingArea(false);
    }
  }

  async function buy() {
    const offer = onTab.find((entry) => entry.topupPlanId === selected);
    if (!offer) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/esim/me/esims/${esimId}/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topupPlanId: offer.topupPlanId, ...(offer.perDay ? { days: daysOf(offer) } : {}) }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        data?: { quoteId: string; product: { productId: string; variantId: string }; priceMinor: number; label: string };
        message?: string;
        error?: string;
      };
      if (!response.ok || !body.data) {
        toast.error(body.message || body.error || t("esim.topup.quoteFailed", "Could not start the top-up"));
        return;
      }
      await addItem({
        productId: body.data.product.productId,
        variantId: body.data.product.variantId,
        quantity: 1,
        price: body.data.priceMinor / 100,
        name: body.data.label,
        lineAttributes: { topup: body.data.quoteId },
      });
      router.push("/checkout");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("esim.topup.quoteFailed", "Could not start the top-up"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {hasOther ? (
        <div role="tablist" className="inline-flex rounded-lg border p-1 text-sm">
          {(["own", "other"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => {
                setTab(key);
                setPage(0);
                setQuery("");
                setSelected(key === "own" ? (offers[0]?.topupPlanId ?? null) : (areaOffers[0]?.topupPlanId ?? null));
              }}
              className={`rounded-md px-3 py-1.5 ${tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {key === "own" ? t("esim.topup.tabOwn", "Renew this plan") : t("esim.topup.tabOther", "Buy for another region")}
            </button>
          ))}
        </div>
      ) : null}
      {tab === "own" && hasOther && !hasOwn ? <p className="text-sm text-muted-foreground">{t("esim.topup.noneHere", "No top-ups here. Try the other tab.")}</p> : null}
      {tab === "other" && !area ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="ps-9"
              value={areaQuery}
              onChange={(event) => setAreaQuery(event.target.value)}
              placeholder={t("esim.topup.areaSearch", "Search a country or region")}
              aria-label={t("esim.topup.areaSearch", "Search a country or region")}
            />
          </div>
          {!areasMatching.length ? <p className="text-sm text-muted-foreground">{t("esim.topup.searchNone", "No top-up matches your search.")}</p> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {areasMatching.slice(0, AREAS_SHOWN).map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => openArea(entry)}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 text-start text-sm transition-colors hover:bg-muted/50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{entry.name}</span>
                  <span className="text-xs text-muted-foreground">{t("esim.topup.areaCount", "{count} plans", { count: entry.count })}</span>
                </span>
                <span className="shrink-0 text-muted-foreground">{t("esim.topup.from", "from {price}", { price: formatPrice(entry.fromPriceMinor / 100) })}</span>
              </button>
            ))}
          </div>
          {areasMatching.length > AREAS_SHOWN ? (
            <p className="text-xs text-muted-foreground">{t("esim.topup.areaMore", "{count} more: search to find them.", { count: areasMatching.length - AREAS_SHOWN })}</p>
          ) : null}
        </div>
      ) : null}
      {tab === "other" && area ? (
        <div className="flex items-center gap-2 text-sm">
          <Button type="button" variant="ghost" size="sm" onClick={() => setArea(null)}>
            <ChevronLeft className="me-1 h-4 w-4 rtl:rotate-180" />
            {t("esim.topup.allAreas", "All regions")}
          </Button>
          <span className="font-medium">{area.name}</span>
          {loadingArea ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </div>
      ) : null}
      {onTab.length > 4 ? (
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="ps-9"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder={t("esim.topup.search", "Search, e.g. 5GB, 7 days, Europe")}
            aria-label={t("esim.topup.searchLabel", "Search top-ups")}
          />
        </div>
      ) : null}
      {words.length && !matching.length ? <p className="text-sm text-muted-foreground">{t("esim.topup.searchNone", "No top-up matches your search.")}</p> : null}
      <div role="radiogroup" aria-label={t("esim.topup.choose", "Choose a top-up")} className="grid gap-3 sm:grid-cols-2">
        {shown.map((card) => {
          const chosen = card.options.find((option) => option.topupPlanId === selected);
          const active = Boolean(chosen);
          const offer = chosen ?? card.options[0];
          return (
            <div
              key={card.key}
              role="radio"
              tabIndex={0}
              aria-checked={active}
              onClick={() => !active && setSelected(card.options[0].topupPlanId)}
              onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && !active && setSelected(card.options[0].topupPlanId)}
              className={`cursor-pointer rounded-lg border p-4 text-start transition-colors ${active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"}`}
            >
              {/* The package's own name: where it works, for a supplier that tops up other regions. */}
              <div className="line-clamp-2 text-sm font-medium">
                {card.area && !card.name.toLowerCase().includes(card.area.toLowerCase()) ? `${card.area} · ` : ""}
                {card.name}
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <span className="text-lg font-semibold">{offer.megabytes ? dataLabel(offer.megabytes) : null}</span>
                <span className="font-semibold">{formatPrice(priceOf(offer) / 100)}</span>
              </div>
              {offer.perDay ? (
                // The days of a day pass, as a day-priced plan's on the product page.
                <div className="mt-3 cursor-default" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                  <DayStepper
                    days={daysOf(offer)}
                    minDays={offer.perDay.minDays}
                    maxDays={offer.perDay.maxDays}
                    defaultDays={offer.perDay.defaultDays}
                    pricePerDay={formatPrice(offer.perDay.priceMinor / 100)}
                    onChange={(value) => {
                      setDayChoice((current) => ({ ...current, [offer.topupPlanId]: value }));
                      setSelected(offer.topupPlanId);
                    }}
                    t={t}
                    idKey={offer.topupPlanId}
                    discounts={offer.perDay.discounts}
                  />
                </div>
              ) : card.options.length > 1 ? (
                <label className="mt-2 flex items-center gap-2 text-sm text-muted-foreground" onClick={(event) => event.stopPropagation()}>
                  {t("esim.topup.days", "Days")}
                  <select
                    className="rounded-md border bg-background px-2 py-1 text-foreground"
                    value={offer.topupPlanId}
                    onChange={(event) => setSelected(event.target.value)}
                  >
                    {card.options.map((option) => (
                      <option key={option.topupPlanId} value={option.topupPlanId}>
                        {t("esim.topup.dayCount", "{count} days", { count: option.validityDays })}
                      </option>
                    ))}
                  </select>
                </label>
              ) : offer.validityDays ? (
                <div className="mt-1 text-sm text-muted-foreground">
                  {t("esim.topup.validFor", "Valid for {count} days", { count: offer.validityDays })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {pages > 1 ? (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            {t("common.previous", "Previous")}
          </Button>
          <span className="tabular-nums text-muted-foreground">
            {page + 1} / {pages}
          </span>
          <Button type="button" variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
            {t("common.next", "Next")}
          </Button>
        </div>
      ) : null}
      <Button size="lg" onClick={buy} disabled={!selected || busy} className="w-full sm:w-auto">
        {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
        {t("esim.topup.buy", "Continue to checkout")}
      </Button>
    </div>
  );
}
