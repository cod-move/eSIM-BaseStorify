"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Minus, Plus, ShoppingCart, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast-notification";
import { useCart } from "@/hooks/use-cart";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { useCurrency } from "@/providers/currency-provider";
import { cn } from "@/lib/utils";
import { FLEX_DAYS, keyOf, resolveSelection, type SelectorChoice, type StorefrontVariant } from "@/lib/esim/storefront/selector";
import { PLAN_CHOOSE_EVENT } from "@/lib/esim/storefront/compare";
import { activationDateBounds } from "@/lib/esim/cart/line-attributes";

/**
 * The plan selector (WEB-13): days → data → top-up → exit IP → price, then
 * straight to the cart or checkout. Every combination it lets the shopper
 * reach is a published variant; the cart prices it again on the server.
 */

interface PlanSelectorProps {
  productId: string;
  name: string;
  variants: StorefrontVariant[];
  /** The destination's own countries, so an exit IP inside them reads "local". */
  countryCodes: string[];
  /**
   * Names of the exit-IP countries, made on the server in the page's locale:
   * the browser's own names can differ ("Hong Kong" / "Hong Kong SAR China")
   * and would break hydration.
   */
  regionNames: Record<string, string>;
  image?: string | null;
}

type Step = "days" | "data" | "topup" | "breakout";

export function PlanSelector({ productId, name, variants, countryCodes, regionNames, image }: PlanSelectorProps) {
  const t = useFallbackTranslator(useTranslations());
  const { formatPrice } = useCurrency();
  const { addItem } = useCart();
  const router = useRouter();
  const [choice, setChoice] = useState<SelectorChoice>({});
  const [days, setDays] = useState<number | null>(null);
  const [busy, setBusy] = useState<"cart" | "buy" | null>(null);
  // ORD-03: start as the plan does, or on a day the shopper picks.
  const [onDate, setOnDate] = useState(false);
  const [startDate, setStartDate] = useState("");
  const selection = useMemo(() => resolveSelection(variants, choice), [variants, choice]);
  const variant = selection.variant;
  const perDay = variant?.perDay ?? null;
  const chosenDays = perDay ? Math.min(perDay.maxDays, Math.max(perDay.minDays, days ?? perDay.defaultDays)) : null;
  const priceMinor = variant ? (perDay && chosenDays ? perDay.priceMinor * chosenDays : variant.priceMinor) : null;

  const pick = (step: Step, value: string) => setChoice((current) => ({ ...current, [step]: value }));

  // A plan chosen in the comparison table (WEB-14) becomes the selection.
  useEffect(() => {
    const onChoose = (event: Event) => {
      const chosen = variants.find((entry) => entry.variantId === (event as CustomEvent<{ variantId: string }>).detail?.variantId);
      if (!chosen) return;
      setChoice({ days: keyOf.days(chosen), data: keyOf.data(chosen), topup: keyOf.topup(chosen), breakout: keyOf.breakout(chosen) });
      setDays(null);
      document.getElementById("esim-plan-selector")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener(PLAN_CHOOSE_EVENT, onChoose);
    return () => window.removeEventListener(PLAN_CHOOSE_EVENT, onChoose);
  }, [variants]);

  const label = {
    days: (value: string) =>
      value === FLEX_DAYS
        ? t("esim.selector.chooseDays", "Choose days")
        : value === "1"
          ? t("esim.selector.oneDay", "1 day")
          : t("esim.selector.nDays", "{days} days", { days: value }),
    data: (value: string) => value,
    topup: (value: string) =>
      value === "stack"
        ? t("esim.selector.topupStack", "Top up this plan")
        : value === "addon"
          ? t("esim.selector.topupAddon", "Add more packages")
          : t("esim.selector.topupNone", "No top-up"),
    breakout: (value: string) => {
      const codes = value ? value.split(",") : [];
      if (!codes.length) return t("esim.selector.ipUnknown", "Standard");
      if (countryCodes.length === 1 && codes.length === 1 && codes[0] === countryCodes[0]) return t("esim.selector.ipLocal", "Local IP");
      return codes.map((code) => regionNames[code] ?? code).join(", ");
    },
  };
  const titles: Record<Step, string> = {
    days: t("esim.selector.days", "How long is your trip?"),
    data: t("esim.selector.data", "How much data?"),
    topup: t("esim.selector.topup", "Top-up"),
    breakout: t("esim.selector.breakout", "IP address"),
  };

  const dated = Boolean(variant?.scheduledActivation && onDate);
  const missingDate = dated && !startDate;

  async function add(then: "cart" | "buy") {
    if (!variant || priceMinor === null || missingDate) return;
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
      if (then === "buy") router.push("/checkout");
      else toast.success(t("esim.selector.added", "Added to cart"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("esim.selector.addFailed", "Could not add to cart"));
    } finally {
      setBusy(null);
    }
  }

  if (!variants.length) {
    return <p className="text-sm text-muted-foreground">{t("esim.selector.none", "No plans are on sale for this destination right now.")}</p>;
  }

  return (
    <div className="space-y-5">
      {(["days", "data", "topup", "breakout"] as const).map((step) =>
        // A step with a single option is a fact, not a choice: it still shows.
        selection[step].length ? (
          <fieldset key={step} className="space-y-2">
            <legend className="text-sm font-semibold">{titles[step]}</legend>
            <div className="flex flex-wrap gap-2">
              {selection[step].map((option) => {
                const active = selection.choice[step] === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => pick(step, option.value)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-start text-sm transition-colors",
                      active ? "border-primary bg-primary/10 font-medium" : "hover:border-foreground/40",
                    )}
                  >
                    <span className="block">{label[step](option.value)}</span>
                    {step === "days" || step === "data" ? (
                      <span className="block text-xs text-muted-foreground">
                        {t("esim.selector.from", "from {price}", { price: formatPrice(option.fromPriceMinor / 100) })}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null,
      )}

      {perDay && chosenDays ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold">{t("esim.selector.numberOfDays", "Number of days")}</span>
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
          <span className="text-xs text-muted-foreground">
            {t("esim.product.perDay", "{price} per day · {min}–{max} days", {
              price: formatPrice(perDay.priceMinor / 100),
              min: perDay.minDays,
              max: perDay.maxDays,
            })}
          </span>
        </div>
      ) : null}

      {variant?.scheduledActivation ? (
        <div className="space-y-2">
          <div className="text-sm font-semibold">{t("esim.selector.start", "When should it start?")}</div>
          <div className="flex flex-wrap gap-2">
            {[false, true].map((choice) => (
              <button
                key={String(choice)}
                type="button"
                onClick={() => setOnDate(choice)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-start text-sm transition-colors",
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

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-muted/30 p-4">
        <div>
          <div className="text-xs text-muted-foreground">
            {variant ? `${variant.dataValue} · ${chosenDays ? label.days(String(chosenDays)) : label.days(String(variant.days))}` : ""}
          </div>
          <div className="text-2xl font-bold">{priceMinor !== null ? formatPrice(priceMinor / 100) : "—"}</div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => add("cart")} disabled={!variant || busy !== null || missingDate}>
            {busy === "cart" ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <ShoppingCart className="me-2 h-4 w-4" />}
            {t("common.addToCart", "Add to cart")}
          </Button>
          <Button onClick={() => add("buy")} disabled={!variant || busy !== null || missingDate}>
            {busy === "buy" ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Zap className="me-2 h-4 w-4" />}
            {t("esim.selector.buyNow", "Buy now")}
          </Button>
        </div>
      </div>
    </div>
  );
}
