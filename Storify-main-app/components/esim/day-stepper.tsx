"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dayPayBp, percentOff, shownDiscounts, type DayDiscount } from "@/lib/esim/pricing/day-discount";

/**
 * The number of days of a day-priced plan or top-up: a stepper that also
 * takes a typed number, quick picks of the usual trip lengths, and the price
 * per day with the range, and the multi-day discounts (the one the chosen
 * days get stands out). The product page's buy box (EsimDayPicker) and the
 * top-up picker draw the same one.
 */

type Translate = (key: string, fallback: string, values?: Record<string, string | number>) => string;

const QUICK_DAYS = [1, 3, 5, 7, 10, 15, 30];

export function DayStepper({
  days,
  minDays,
  maxDays,
  defaultDays,
  pricePerDay,
  onChange,
  t,
  idKey,
  discounts,
}: {
  days: number;
  minDays: number;
  maxDays: number;
  defaultDays: number;
  /** The price of one day, formatted. */
  pricePerDay: string;
  onChange: (days: number) => void;
  t: Translate;
  /** Redraws the typed field when what it counts for changes (a variant, an offer). */
  idKey?: string;
  /** Multi-day discount tiers; none shown when empty. */
  discounts?: DayDiscount[];
}) {
  const choose = (value: number) => onChange(Math.min(maxDays, Math.max(minDays, Math.round(value))));
  const quick = QUICK_DAYS.filter((value) => value >= minDays && value <= maxDays);
  const tiers = shownDiscounts(discounts, minDays, maxDays);
  const paying = dayPayBp(discounts, days);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 lg:justify-between">
        <span className="text-sm font-semibold text-foreground">{t("esim.product.days", "Days")}</span>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => choose(days - 1)}
            disabled={days <= minDays}
            aria-label={t("esim.product.fewerDays", "One day fewer")}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          {/* Typed freely, applied on blur or Enter; redrawn when the days change. */}
          <Input
            key={`${idKey ?? ""}-${days}`}
            type="number"
            inputMode="numeric"
            min={minDays}
            max={maxDays}
            defaultValue={days}
            onBlur={(event) => choose(Number(event.currentTarget.value) || defaultDays)}
            onKeyDown={(event) => {
              if (event.key === "Enter") choose(Number(event.currentTarget.value) || defaultDays);
            }}
            className="h-8 w-16 text-center"
            aria-label={t("esim.product.days", "Days")}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => choose(days + 1)}
            disabled={days >= maxDays}
            aria-label={t("esim.product.moreDays", "One day more")}
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
              {value === 1 ? t("esim.product.oneDay", "1 day") : t("esim.product.nDays", "{days} days", { days: value })}
            </button>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {t("esim.product.perDay", "{price} per day · {min}–{max} days", { price: pricePerDay, min: minDays, max: maxDays })}
      </p>
      {tiers.length ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-foreground">
            {paying < 10_000
              ? t("esim.product.dayDiscountNow", "{days} days: {off}% off the daily price", { days, off: percentOff(paying) })
              : t("esim.product.dayDiscounts", "Longer stays cost less per day")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {tiers.map((tier) => {
              const active = days >= tier.minDays && days <= tier.maxDays;
              return (
                <span
                  key={`${tier.minDays}-${tier.maxDays}`}
                  className={`rounded-md border px-2 py-0.5 text-[11px] ${
                    active ? "border-emerald-600 bg-emerald-50 font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "text-muted-foreground"
                  }`}
                >
                  {tier.minDays === tier.maxDays
                    ? t("esim.product.dayTierOne", "{min} days −{off}%", { min: tier.minDays, off: percentOff(tier.payBp) })
                    : tier.maxDays >= maxDays
                      ? t("esim.product.dayTierFrom", "{min}+ days −{off}%", { min: tier.minDays, off: percentOff(tier.payBp) })
                      : t("esim.product.dayTier", "{min}–{max} days −{off}%", { min: tier.minDays, max: tier.maxDays, off: percentOff(tier.payBp) })}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
