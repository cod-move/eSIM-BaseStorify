"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Save, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast-notification";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { AdminPaymentMethod } from "@/lib/esim/admin/payments";
import type { CheckoutDisplayAdmin } from "@/lib/esim/admin/checkout-display";
import type { PaymentFeeRule } from "@/lib/esim/payments/fee-rules";
import { EsimGatewayCard } from "@/components/esim/admin/payments-admin";
import { EsimPaymentFeesCard } from "@/components/esim/admin/payment-fees-card";

/**
 * What the eSIM module adds to Storify's payment settings page (patch P34):
 * how checkout lists every payment method — the order, the one chosen to
 * begin with, an icon each — and the eSIM payment gateways with the payment
 * fees. Each part loads and saves through the eSIM admin API, held to the
 * eSIM team permissions; an admin without them sees nothing of it.
 */

type DisplayView = CheckoutDisplayAdmin & { canManage: boolean };

/** Uploads one image through Storify's media upload; its URL. */
async function uploadIcon(file: File): Promise<string> {
  const form = new FormData();
  form.append("files", file);
  const response = await fetch("/api/upload", { method: "POST", body: form });
  const json = (await response.json().catch(() => null)) as { success?: boolean; message?: unknown; data?: Array<{ url?: unknown }> } | null;
  const url = json?.success ? json.data?.[0]?.url : null;
  if (typeof url !== "string" || !url) throw new Error(typeof json?.message === "string" ? json.message : "Upload failed");
  return url;
}

function IconCell({ url, label, disabled, onChange }: { url: string | undefined; label: string; disabled: boolean; onChange: (url: string) => void }) {
  const t = useFallbackTranslator(useTranslations());
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadIcon(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex h-8 w-12 items-center justify-center rounded border bg-white">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- an uploaded icon, any host
          <img src={url} alt={label} className="max-h-6 max-w-10 object-contain" />
        ) : (
          <span className="text-[10px] text-muted-foreground">{t("admin.esim.iconDefault", "Default")}</span>
        )}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="hidden" onChange={(event) => void pick(event.target.files?.[0])} />
      <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={disabled || busy} onClick={() => input.current?.click()} aria-label={t("admin.esim.iconUpload", "Upload icon")} title={t("admin.esim.iconUpload", "Upload icon")}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
      </Button>
      {url ? (
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={disabled} onClick={() => onChange("")} aria-label={t("admin.esim.iconRemove", "Remove icon")} title={t("admin.esim.iconRemove", "Remove icon")}>
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}

/** The order, default and icon of every checkout payment method. */
export function EsimCheckoutDisplayCard() {
  const t = useFallbackTranslator(useTranslations());
  const [view, setView] = useState<DisplayView | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [defaultMethod, setDefaultMethod] = useState<string | null>(null);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiClient.get<DisplayView>("/api/esim/admin/checkout-display");
      setView(data);
      setOrder(data.methods.map((row) => row.method));
      setDefaultMethod(data.defaultMethod);
      setIcons(data.icons);
    } catch {
      setView(null);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!view) return null;
  const rows = order.map((method) => view.methods.find((row) => row.method === method)!).filter(Boolean);
  const changed =
    JSON.stringify(order) !== JSON.stringify(view.methods.map((row) => row.method)) ||
    defaultMethod !== view.defaultMethod ||
    JSON.stringify(icons) !== JSON.stringify(view.icons);
  const move = (index: number, by: number) =>
    setOrder((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item);
      return next;
    });

  async function save() {
    setSaving(true);
    try {
      await apiClient.put("/api/esim/admin/checkout-display", { order, defaultMethod, icons });
      toast.success(t("admin.esim.saved", "Saved"));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.esim.checkoutDisplayTitle", "Payment methods at checkout")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(
            "admin.esim.checkoutDisplayHint",
            "The order shoppers see the payment methods in, the one chosen when checkout opens, and each one's icon. Only methods switched on are shown. The account balance always comes first when it covers the order.",
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y rounded-lg border">
          {rows.map((row, index) => (
            <li key={row.method} className={cn("flex flex-wrap items-center gap-3 px-3 py-2", !row.on && "text-muted-foreground")}>
              <div className="flex flex-col">
                <Button type="button" size="icon" variant="ghost" className="h-6 w-6" disabled={!view.canManage || index === 0} onClick={() => move(index, -1)} aria-label={t("admin.esim.moveUp", "Move up")}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-6 w-6" disabled={!view.canManage || index === rows.length - 1} onClick={() => move(index, 1)} aria-label={t("admin.esim.moveDown", "Move down")}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
              <IconCell url={icons[row.method]} label={row.label} disabled={!view.canManage} onChange={(url) => setIcons((current) => {
                const next = { ...current };
                if (url) next[row.method] = url;
                else delete next[row.method];
                return next;
              })} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{row.label}</div>
                <div className="flex gap-1.5">
                  {row.esim ? <Badge variant="outline" className="text-[10px]">eSIM</Badge> : null}
                  {!row.on ? <Badge variant="secondary" className="text-[10px]">{t("admin.esim.disabled", "Off")}</Badge> : null}
                </div>
              </div>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="esim-checkout-default"
                  checked={defaultMethod === row.method}
                  disabled={!view.canManage}
                  onChange={() => setDefaultMethod(row.method)}
                />
                {t("admin.esim.checkoutDefault", "Default")}
              </label>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <input type="radio" name="esim-checkout-default" checked={defaultMethod === null} disabled={!view.canManage} onChange={() => setDefaultMethod(null)} />
            {t("admin.esim.checkoutNoDefault", "No default: the first one that can take the order")}
          </label>
          {view.canManage ? (
            <Button type="button" className="ms-auto" onClick={() => void save()} disabled={saving || !changed}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {t("admin.esim.save", "Save")}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** The eSIM payment gateways, each a card like Storify's, and the payment fees. */
export function EsimGatewaysSection() {
  const t = useFallbackTranslator(useTranslations());
  const [state, setState] = useState<{ methods: AdminPaymentMethod[]; fees: PaymentFeeRule[]; canManage: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const [methods, fees, display] = await Promise.all([
        apiClient.get<AdminPaymentMethod[]>("/api/esim/admin/payments/methods"),
        apiClient.get<PaymentFeeRule[]>("/api/esim/admin/payment-fees"),
        apiClient.get<DisplayView>("/api/esim/admin/checkout-display"),
      ]);
      setState({ methods, fees, canManage: display.canManage });
    } catch {
      setState(null);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!state) return null;
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">{t("admin.esim.esimGatewaysTitle", "eSIM payment gateways")}</h3>
        <p className="text-sm text-muted-foreground">
          {t(
            "admin.esim.esimGatewaysHint",
            "Gateways run by the eSIM module. Each one switched on and set up is a payment method of its own at checkout; the order is placed when the gateway confirms the payment, and refunds are made by hand in the gateway.",
          )}
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {state.methods.map((method) => (
          <EsimGatewayCard key={`${method.code}-${method.status}-${method.name}`} method={method} canManage={state.canManage} onChanged={() => void load()} />
        ))}
      </div>
      <EsimPaymentFeesCard fees={state.fees} canManage={state.canManage} onSaved={() => void load()} />
    </div>
  );
}
