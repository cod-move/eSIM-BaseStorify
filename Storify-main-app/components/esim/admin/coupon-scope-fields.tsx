"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import {
  scopeModeOf,
  scopeValueOf,
  type CouponScopeMode,
  type CouponScopeOptions,
  type CouponScopeValue,
} from "@/lib/esim/admin/coupon-scope-mode";

interface ScopeData {
  numberProductId: string | null;
  esimCategoryId: string | null;
  destinations: Array<{ productId: string; name: string; scope: string; emoji: string | null }>;
}

const MODES: Array<Exclude<CouponScopeMode, "custom">> = ["all", "numbers", "travel", "destinations"];

/**
 * "Applies to" on the admin's discount form (patch P67): every product, the
 * number cards only, every travel eSIM, or chosen destinations. Writes
 * Storify's own `applicableProducts` / `applicableCategories`
 * (lib/esim/admin/coupon-scope-mode.ts). A coupon already limited some other
 * way shows "Custom" and is left as it is until another choice is made.
 */
export function CouponScopeFields({ value, onChange }: { value: CouponScopeValue; onChange: (next: CouponScopeValue) => void }) {
  const t = useFallbackTranslator(useTranslations());
  const [data, setData] = useState<ScopeData | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState("");
  // The mode picked by hand: "destinations" with none chosen yet still shows the list.
  const [picked, setPicked] = useState<CouponScopeMode | null>(null);

  useEffect(() => {
    let active = true;
    apiClient
      .get<ScopeData>("/api/esim/admin/coupon-scope")
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const options: CouponScopeOptions = useMemo(
    () => ({
      numberProductId: data?.numberProductId ?? null,
      esimCategoryId: data?.esimCategoryId ?? null,
      destinationProductIds: data?.destinations.map((destination) => destination.productId) ?? [],
    }),
    [data],
  );
  const derived = data ? scopeModeOf(value, options) : null;
  const mode = picked === "destinations" && derived === "all" ? "destinations" : derived;
  const chosen = new Set(value.applicableProducts);
  const shown = (data?.destinations ?? []).filter((destination) =>
    destination.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  const choose = (next: Exclude<CouponScopeMode, "custom">) => {
    setPicked(next);
    const keep = next === "destinations" && mode === "destinations" ? value.applicableProducts : [];
    const fields = scopeValueOf(next, options, keep);
    if (fields) onChange(fields);
  };
  const toggle = (productId: string, on: boolean) => {
    const products = on ? [...value.applicableProducts, productId] : value.applicableProducts.filter((id) => id !== productId);
    onChange(scopeValueOf("destinations", options, products)!);
  };

  const label = (entry: CouponScopeMode) =>
    ({
      all: t("admin.esim.couponScopeAll", "All products"),
      numbers: t("admin.esim.couponScopeNumbers", "Number cards only"),
      travel: t("admin.esim.couponScopeTravel", "All travel eSIMs"),
      destinations: t("admin.esim.couponScopeDestinations", "Chosen destinations"),
      custom: t("admin.esim.couponScopeCustom", "Custom (kept as it is)"),
    })[entry];

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label>{t("admin.esim.couponScope", "Applies to")}</Label>
      {failed ? (
        <p className="text-sm text-muted-foreground">{t("admin.esim.couponScopeFailed", "The choices could not be loaded (no eSIM access?). The coupon keeps what it applies to.")}</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">{t("admin.esim.couponScopeLoading", "Loading…")}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {[...MODES, ...(mode === "custom" ? (["custom"] as const) : [])].map((entry) => (
              <button
                key={entry}
                type="button"
                role="radio"
                aria-checked={mode === entry}
                disabled={entry === "custom" || (entry === "numbers" && !data.numberProductId) || (entry === "travel" && !data.esimCategoryId)}
                onClick={() => entry !== "custom" && choose(entry)}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-60 ${mode === entry ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"}`}
              >
                {label(entry)}
              </button>
            ))}
          </div>
          {mode === "destinations" ? (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  {t("admin.esim.couponScopeChosen", "{count} chosen", { count: value.applicableProducts.length })}
                </span>
              </div>
              <Input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={t("admin.esim.campaignFind", "Find a destination")}
              />
              <div className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
                {shown.map((destination) => (
                  <label key={destination.productId} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={chosen.has(destination.productId)}
                      onCheckedChange={(on) => toggle(destination.productId, on === true)}
                    />
                    <span>
                      {destination.emoji ? `${destination.emoji} ` : ""}
                      {destination.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
