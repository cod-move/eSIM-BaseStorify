"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { useProductPurchase } from "@/components/products/product-purchase";
import { activationDateBounds } from "@/lib/esim/cart/line-attributes";
import { daysPriceMinor, type DayDiscount } from "@/lib/esim/pricing/day-discount";
import { DayStepper } from "./day-stepper";

/**
 * An eSIM variant's options in the product page's buy box (patch point P10):
 * the number of days of a day-priced variant, and the day it starts for a
 * variant whose suppliers schedule activation (ORD-03). Draws nothing for any
 * other variant or product.
 *
 * The choice goes to the purchase state as the line's options and the price
 * they give; the cart re-prices the line on the server either way.
 */

type PerDay = { priceMinor: number; minDays: number; maxDays: number; defaultDays: number; discounts?: DayDiscount[] };

const pricingCache = new Map<string, Promise<Record<string, PerDay>>>();

const startDatesCache = new Map<string, Promise<string[]>>();

function loadStartDates(productId: string) {
  let pending = startDatesCache.get(productId);
  if (!pending) {
    pending = fetch(`/api/esim/catalog/products/${productId}/start-dates`)
      .then((response) => (response.ok ? response.json() : { data: [] }))
      .then((body: { data?: string[] }) => body.data ?? [])
      .catch(() => []);
    startDatesCache.set(productId, pending);
  }
  return pending;
}

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
  const [startDates, setStartDates] = useState<string[]>([]);
  const [onDate, setOnDate] = useState(false);
  const productId = String(product._id);
  const variantId = selectedVariant?._id ? String(selectedVariant._id) : undefined;
  const perDay = variantId ? pricing[variantId] : undefined;
  const scheduled = variantId ? startDates.includes(variantId) : false;
  const days = typeof lineOptions?.attributes.days === "number" ? lineOptions.attributes.days : perDay?.defaultDays;
  const activateOn = typeof lineOptions?.attributes.activateOn === "string" ? lineOptions.attributes.activateOn : "";

  useEffect(() => {
    let live = true;
    void loadPricing(productId).then((value) => live && setPricing(value));
    void loadStartDates(productId).then((value) => live && setStartDates(value));
    return () => {
      live = false;
    };
  }, [productId]);

  /** The line's options as they now stand, priced: per day, else the variant's own price. */
  const commit = (nextDays: number | undefined, nextDate: string) => {
    if (!variantId) return;
    const attributes = {
      ...(perDay && nextDays !== undefined ? { days: nextDays } : {}),
      ...(scheduled && nextDate ? { activateOn: nextDate } : {}),
    };
    if (!Object.keys(attributes).length) return setLineOptions(null);
    const price = perDay && nextDays !== undefined ? daysPriceMinor(perDay.priceMinor, nextDays, perDay.discounts) / 100 : Number(selectedVariant?.price ?? 0);
    setLineOptions({ variantId, attributes, price });
  };

  // A day-priced variant starts on its default days (the purchase state is
  // the buy box's, outside this control).
  useEffect(() => {
    if (perDay && variantId && lineOptions?.variantId !== variantId) {
      setLineOptions({
        variantId,
        attributes: { days: perDay.defaultDays },
        price: daysPriceMinor(perDay.priceMinor, perDay.defaultDays, perDay.discounts) / 100,
      });
    }
  }, [perDay, variantId, lineOptions?.variantId, setLineOptions]);

  if ((!perDay || days === undefined) && !scheduled) return null;
  const bounds = activationDateBounds();

  return (
    <div className="space-y-2.5 pt-3.5">
      {perDay && days !== undefined ? (
        <DayStepper
          days={days}
          minDays={perDay.minDays}
          maxDays={perDay.maxDays}
          defaultDays={perDay.defaultDays}
          pricePerDay={formatPrice(perDay.priceMinor / 100)}
          onChange={(value) => commit(value, activateOn)}
          t={tf}
          idKey={variantId}
          discounts={perDay.discounts}
        />
      ) : null}
      {scheduled ? (
        <div className="space-y-2">
          <span className="text-sm font-semibold text-foreground">{tf("esim.selector.start", "When should it start?")}</span>
          <div className="flex flex-wrap gap-1.5">
            {[false, true].map((choice) => (
              <button
                key={String(choice)}
                type="button"
                onClick={() => {
                  setOnDate(choice);
                  if (!choice) commit(days, "");
                }}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  (choice ? onDate || Boolean(activateOn) : !onDate && !activateOn) ? "border-primary bg-primary text-primary-foreground" : "hover:border-foreground/40"
                }`}
              >
                {choice ? tf("esim.selector.startOnDate", "On a date") : tf("esim.selector.startNow", "As usual")}
              </button>
            ))}
          </div>
          {onDate || activateOn ? (
            <div className="space-y-1">
              <Input
                type="date"
                value={activateOn}
                min={bounds.min}
                max={bounds.max}
                onChange={(event) => commit(days, event.target.value)}
                onClick={(event) => event.currentTarget.showPicker?.()}
                className="h-8 w-44"
                aria-label={tf("esim.selector.startDate", "Start date")}
              />
              <p className="text-xs text-muted-foreground">{tf("esim.selector.startHint", "The plan starts on this day (UTC), not when you install it.")}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
