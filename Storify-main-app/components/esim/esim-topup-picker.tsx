"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
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
      <div role="radiogroup" aria-label={t("esim.topup.choose", "Choose a top-up")} className="grid gap-3 sm:grid-cols-2">
        {offers.map((offer) => {
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
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-lg font-semibold">{offer.megabytes ? dataLabel(offer.megabytes) : offer.name}</span>
                <span className="font-semibold">{formatPrice(offer.priceMinor / 100)}</span>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {offer.validityDays
                  ? t("esim.topup.validFor", "Valid for {count} days", { count: offer.validityDays })
                  : offer.name}
              </div>
            </button>
          );
        })}
      </div>
      <Button size="lg" onClick={buy} disabled={!selected || busy} className="w-full sm:w-auto">
        {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
        {t("esim.topup.buy", "Continue to checkout")}
      </Button>
    </div>
  );
}
