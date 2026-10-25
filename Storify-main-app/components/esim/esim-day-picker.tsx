"use client";

import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProductPurchase } from "@/components/products/product-purchase";

/**
 * The number of days for a day-priced eSIM variant, in the product page's buy
 * box (patch point P10). Draws nothing for any other variant or product.
 *
 * The choice goes to the purchase state as the line's options and the price
 * they give; the cart re-prices the line on the server either way.
 */

type PerDay = { priceMinor: number; minDays: number; maxDays: number; defaultDays: number };

const QUICK_DAYS = [1, 3, 5, 7, 10, 15, 30];
const pricingCache = new Map<string, Promise<Record<string, PerDay>>>();

function loadPricing(productId: string) {
  let pending = pricingCache.get(productId);
  if (!pending) {
    pending = fetch(`/api/esim/catalog/products/${productId}/day-pricing`)
      .then((response) => (response.ok ? response.json() : { data: {} }))
      .then((body: { data?: Record<string, PerDay> }) => body.data ?? {})
      .catch(() => ({}));
    pricingCache.set(productId, pending);
  }
  return pending;
}

export function EsimDayPicker() {
  const { product, selectedVariant, lineOptions, setLineOptions, formatPrice, tf } = useProductPurchase();
  const [pricing, setPricing] = useState<Record<string, PerDay>>({});
  const productId = String(product._id);
  const variantId = selectedVariant?._id ? String(selectedVariant._id) : undefined;
  const perDay = variantId ? pricing[variantId] : undefined;
  const days = typeof lineOptions?.attributes.days === "number" ? lineOptions.attributes.days : perDay?.defaultDays;

  useEffect(() => {
    let live = true;
    void loadPricing(productId).then((value) => live && setPricing(value));
    return () => {
      live = false;
    };
  }, [productId]);

  const choose = (value: number) => {
    if (!perDay || !variantId) return;
    const next = Math.min(perDay.maxDays, Math.max(perDay.minDays, Math.round(value)));
    setLineOptions({ variantId, attributes: { days: next }, price: (perDay.priceMinor * next) / 100 });
  };

  // A day-priced variant starts on its default days (the purchase state is
  // the buy box's, outside this control).
  useEffect(() => {
    if (perDay && variantId && lineOptions?.variantId !== variantId) {
      setLineOptions({
        variantId,
        attributes: { days: perDay.defaultDays },
        price: (perDay.priceMinor * perDay.defaultDays) / 100,
      });
    }
  }, [perDay, variantId, lineOptions?.variantId, setLineOptions]);

  if (!perDay || days === undefined) return null;
  const quick = QUICK_DAYS.filter((value) => value >= perDay.minDays && value <= perDay.maxDays);

  return (
    <div className="space-y-2.5 pt-3.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 lg:justify-between">
        <span className="text-sm font-semibold text-foreground">{tf("esim.product.days", "Days")}</span>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => choose(days - 1)}
            disabled={days <= perDay.minDays}
            aria-label={tf("esim.product.fewerDays", "One day fewer")}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          {/* Typed freely, applied on blur or Enter; redrawn when the days change. */}
          <Input
            key={`${variantId}-${days}`}
            type="number"
            inputMode="numeric"
            min={perDay.minDays}
            max={perDay.maxDays}
            defaultValue={days}
            onBlur={(event) => choose(Number(event.currentTarget.value) || perDay.defaultDays)}
            onKeyDown={(event) => {
              if (event.key === "Enter") choose(Number(event.currentTarget.value) || perDay.defaultDays);
            }}
            className="h-8 w-16 text-center"
            aria-label={tf("esim.product.days", "Days")}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => choose(days + 1)}
            disabled={days >= perDay.maxDays}
            aria-label={tf("esim.product.moreDays", "One day more")}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {quick.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {quick.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => choose(value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                value === days ? "border-primary bg-primary text-primary-foreground" : "hover:border-foreground/40"
              }`}
            >
              {value === 1 ? tf("esim.product.oneDay", "1 day") : tf("esim.product.nDays", "{days} days", { days: value })}
            </button>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {tf("esim.product.perDay", "{price} per day · {min}–{max} days", {
          price: formatPrice(perDay.priceMinor / 100),
          min: perDay.minDays,
          max: perDay.maxDays,
        })}
      </p>
    </div>
  );
}
