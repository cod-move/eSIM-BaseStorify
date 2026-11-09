"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast-notification";
import { useCart } from "@/hooks/use-cart";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { useCurrency } from "@/providers/currency-provider";

export interface TopupPickerOffer {
  topupPlanId: string;
  name: string;
  megabytes: number;
  validityDays: number;
  priceMinor: number;
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
export function EsimTopupPicker({ esimId, offers }: { esimId: string; offers: TopupPickerOffer[] }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const { addItem } = useCart();
  const { formatPrice } = useCurrency();
  const [selected, setSelected] = useState(offers[0]?.topupPlanId ?? null);
  const [busy, setBusy] = useState(false);
  // A supplier like BNESIM offers top-ups for other regions too: many of them, so in pages.
  const [page, setPage] = useState(0);
  // Search by name, data ("5 GB", "500MB") or days ("7"), every word must match.
  const [query, setQuery] = useState("");
  const words = query.toLowerCase().replace(/(\d)\s*(gb|mb|days?|天)/g, "$1$2").split(/\s+/).filter(Boolean);
  const matching = words.length
    ? offers.filter((offer) => {
        const text = `${offer.name} ${dataLabel(offer.megabytes).replace(" ", "")} ${offer.validityDays}days ${offer.validityDays}day ${offer.validityDays}天 ${offer.validityDays}`.toLowerCase();
        return words.every((word) => text.includes(word));
      })
    : offers;
  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const shown = matching.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  async function buy() {
    const offer = offers.find((entry) => entry.topupPlanId === selected);
    if (!offer) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/esim/me/esims/${esimId}/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topupPlanId: offer.topupPlanId }),
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
      {offers.length > 4 ? (
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
        {shown.map((offer) => {
          const active = offer.topupPlanId === selected;
          return (
            <button
              key={offer.topupPlanId}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSelected(offer.topupPlanId)}
              className={`rounded-lg border p-4 text-start transition-colors ${active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"}`}
            >
              {/* The package's own name: where it works, for a supplier that tops up other regions. */}
              <div className="line-clamp-2 text-sm font-medium">{offer.name}</div>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <span className="text-lg font-semibold">{offer.megabytes ? dataLabel(offer.megabytes) : null}</span>
                <span className="font-semibold">{formatPrice(offer.priceMinor / 100)}</span>
              </div>
              {offer.validityDays ? (
                <div className="mt-1 text-sm text-muted-foreground">
                  {t("esim.topup.validFor", "Valid for {count} days", { count: offer.validityDays })}
                </div>
              ) : null}
            </button>
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
