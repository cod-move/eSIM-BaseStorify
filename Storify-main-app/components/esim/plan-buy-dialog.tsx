"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Minus, Plus, ShoppingCart, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast-notification";
import { useCart } from "@/hooks/use-cart";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { useCurrency } from "@/providers/currency-provider";
import { cn } from "@/lib/utils";
import type { StorefrontVariant } from "@/lib/esim/storefront/selector";
import { activationDateBounds } from "@/lib/esim/cart/line-attributes";

/**
 * What a plan card asks before the cart when its plan has a choice left: the
 * number of days of a day-priced plan, and the day it starts for a plan whose
 * suppliers schedule activation (ORD-03). The cart prices the line again on
 * the server.
 */

export function PlanBuyDialog({
  variant,
  onClose,
  productId,
  name,
  image,
  summary,
}: {
  variant: StorefrontVariant | null;
  onClose: () => void;
  productId: string;
  name: string;
  image?: string | null;
  summary: string;
}) {
  const t = useFallbackTranslator(useTranslations());
  return (
    <Dialog open={variant !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>{summary}</DialogDescription>
        </DialogHeader>
        {variant ? <BuyForm key={variant.variantId} variant={variant} productId={productId} name={name} image={image} onDone={onClose} t={t} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function BuyForm({
  variant,
  productId,
  name,
  image,
  onDone,
  t,
}: {
  variant: StorefrontVariant;
  productId: string;
  name: string;
  image?: string | null;
  onDone: () => void;
  t: ReturnType<typeof useFallbackTranslator>;
}) {
  const { formatPrice } = useCurrency();
  const { addItem } = useCart();
  const router = useRouter();
  const perDay = variant.perDay;
  const [days, setDays] = useState(perDay?.defaultDays ?? null);
  const [busy, setBusy] = useState<"cart" | "buy" | null>(null);
  const [onDate, setOnDate] = useState(false);
  const [startDate, setStartDate] = useState("");
  const chosenDays = perDay ? Math.min(perDay.maxDays, Math.max(perDay.minDays, days ?? perDay.defaultDays)) : null;
  const priceMinor = perDay && chosenDays ? perDay.priceMinor * chosenDays : variant.priceMinor;
  const dated = Boolean(variant.scheduledActivation && onDate);
  const missingDate = dated && !startDate;

  async function add(then: "cart" | "buy") {
    if (missingDate) return;
    const attributes = {
      ...(perDay && chosenDays ? { days: chosenDays } : {}),
      ...(dated ? { activateOn: startDate } : {}),
    };
    setBusy(then);
    try {
      await addItem({
        productId,
        variantId: variant.variantId,
        quantity: 1,
        price: priceMinor / 100,
        name,
        image: image ?? undefined,
        lineAttributes: Object.keys(attributes).length ? attributes : undefined,
      });
      onDone();
      if (then === "buy") router.push("/checkout");
      else toast.success(t("esim.selector.added", "Added to cart"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("esim.selector.addFailed", "Could not add to cart"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {perDay && chosenDays ? (
        <div className="space-y-2">
          <div className="text-sm font-semibold">{t("esim.selector.numberOfDays", "Number of days")}</div>
          <div className="flex items-center gap-1.5">
            <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={chosenDays <= perDay.minDays} onClick={() => setDays(chosenDays - 1)} aria-label={t("esim.product.fewerDays", "One day fewer")}>
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Input
              key={chosenDays}
              type="number"
              inputMode="numeric"
              min={perDay.minDays}
              max={perDay.maxDays}
              defaultValue={chosenDays}
              onBlur={(event) => setDays(Number(event.currentTarget.value) || perDay.defaultDays)}
              onKeyDown={(event) => {
                if (event.key === "Enter") setDays(Number(event.currentTarget.value) || perDay.defaultDays);
              }}
              className="h-8 w-16 text-center"
              aria-label={t("esim.selector.numberOfDays", "Number of days")}
            />
            <Button type="button" variant="outline" size="icon" className="h-8 w-8" disabled={chosenDays >= perDay.maxDays} onClick={() => setDays(chosenDays + 1)} aria-label={t("esim.product.moreDays", "One day more")}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("esim.product.perDay", "{price} per day · {min}–{max} days", {
              price: formatPrice(perDay.priceMinor / 100),
              min: perDay.minDays,
              max: perDay.maxDays,
            })}
          </p>
        </div>
      ) : null}

      {variant.scheduledActivation ? (
        <div className="space-y-2">
          <div className="text-sm font-semibold">{t("esim.selector.start", "When should it start?")}</div>
          <div className="flex flex-wrap gap-2">
            {[false, true].map((choice) => (
              <button
                key={String(choice)}
                type="button"
                onClick={() => setOnDate(choice)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                  onDate === choice ? "border-primary bg-primary/10 font-medium" : "hover:border-foreground/40",
                )}
              >
                {choice ? t("esim.selector.startOnDate", "On a date") : t("esim.selector.startNow", "As usual")}
              </button>
            ))}
          </div>
          {onDate ? (
            <div className="space-y-1">
              <Input
                type="date"
                value={startDate}
                min={activationDateBounds().min}
                max={activationDateBounds().max}
                onChange={(event) => setStartDate(event.target.value)}
                onClick={(event) => event.currentTarget.showPicker?.()}
                className="w-48"
                aria-label={t("esim.selector.startDate", "Start date")}
              />
              <p className="text-xs text-muted-foreground">{t("esim.selector.startHint", "The plan starts on this day (UTC), not when you install it.")}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-3">
        <div className="text-2xl font-bold">{formatPrice(priceMinor / 100)}</div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => add("cart")} disabled={busy !== null || missingDate}>
            {busy === "cart" ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <ShoppingCart className="me-2 h-4 w-4" />}
            {t("common.addToCart", "Add to cart")}
          </Button>
          <Button onClick={() => add("buy")} disabled={busy !== null || missingDate}>
            {busy === "buy" ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Zap className="me-2 h-4 w-4" />}
            {t("esim.selector.buyNow", "Buy now")}
          </Button>
        </div>
      </div>
    </div>
  );
}
