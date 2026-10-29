"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast-notification";
import Link from "@/components/language/link";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import type { PaymentPageView, ShopperPay } from "@/lib/esim/payments/service";

const POLL_MS = 4000;

/**
 * Pick a method, pay, wait (PAY, patch P15). While a payment is waiting for
 * the gateway's confirmation the page asks again every few seconds; once the
 * order exists it moves on to Storify's order confirmation.
 */
export function EsimPayPage({ initial, appReturn }: { initial: PaymentPageView; appReturn: { done: string; cancel: string } | null }) {
  const t = useFallbackTranslator(useTranslations());
  const locale = useLocale();
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [pay, setPay] = useState<ShopperPay | null>(initial.latest?.pay ?? null);
  const waiting = view.state === "open" && (view.latest?.state === "pending" || view.latest?.state === "paid");

  const amount = new Intl.NumberFormat(locale, { style: "currency", currency: view.currency }).format(view.amountMinor / 100);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/esim/pay/${view.checkoutRef}`, { cache: "no-store" });
    if (!response.ok) return;
    const json = (await response.json()) as { data?: PaymentPageView };
    if (json.data) setView(json.data);
  }, [view.checkoutRef]);

  useEffect(() => {
    if (view.state === "paid" && view.orderNumber) {
      if (appReturn) {
        window.location.replace(appReturn.done);
        return;
      }
      router.replace(`/checkout/success?order=${encodeURIComponent(view.orderNumber)}`);
    }
  }, [view.state, view.orderNumber, router, appReturn]);

  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [waiting, refresh]);

  async function choose(method: string) {
    setBusy(method);
    try {
      const response = await fetch(`/api/esim/pay/${view.checkoutRef}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, locale, app: Boolean(appReturn) }),
      });
      const json = (await response.json()) as { data?: { reference: string; pay: ShopperPay }; message?: string };
      if (!response.ok || !json.data) throw new Error(json.message || "The payment could not be started");
      if (json.data.pay.kind === "redirect") {
        window.location.assign(json.data.pay.data);
        return;
      }
      setPay(json.data.pay);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  if (view.state === "paid") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
          <p className="font-medium">{t("esim.pay.paid", "Payment received")}</p>
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (view.state === "closed") {
    return (
      <Card>
        <CardContent className="space-y-4 py-10 text-center">
          <p className="font-medium">{t("esim.pay.closed", "This checkout has closed.")}</p>
          <p className="text-sm text-muted-foreground">
            {t("esim.pay.closedNote", "If you paid, the payment will be refunded. Please check out again.")}
          </p>
          <Button asChild>
            {appReturn ? (
              <a href={appReturn.cancel}>{t("esim.pay.backToApp", "Back to the app")}</a>
            ) : (
              <Link href="/cart">{t("esim.pay.backToCart", "Back to cart")}</Link>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-1 text-center">
        <CardTitle>{t("esim.pay.title", "Complete your payment")}</CardTitle>
        <p className="text-3xl font-bold">{amount}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {pay?.kind === "qr" && view.latest?.state === "pending" ? (
          <div className="flex flex-col items-center gap-3 text-center">
            {pay.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- a data URL made on the server
              <img src={pay.image} alt={t("esim.pay.qrAlt", "Payment QR code")} width={280} height={280} className="rounded-md border bg-white p-2" />
            ) : null}
            <p className="text-sm text-muted-foreground">{t("esim.pay.scan", "Scan the code with your wallet app to pay.")}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void navigator.clipboard?.writeText(pay.data)}>
              {t("esim.pay.copy", "Copy payment details")}
            </Button>
          </div>
        ) : null}

        {waiting ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("esim.pay.waiting", "Waiting for the payment to be confirmed…")}
          </div>
        ) : null}

        {view.methods.length ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {waiting ? t("esim.pay.another", "Or pay another way") : t("esim.pay.choose", "Choose how to pay")}
            </p>
            {view.methods.map((method) => (
              <Button key={method.code} type="button" variant="outline" className="h-12 w-full justify-start gap-3" disabled={busy !== null} onClick={() => void choose(method.code)}>
                {busy === method.code ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                {method.name}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">{t("esim.pay.none", "No payment method is available right now. Please try again later.")}</p>
        )}
        {appReturn ? (
          <Button asChild variant="ghost" className="w-full">
            <a href={appReturn.cancel}>{t("esim.pay.backToApp", "Back to the app")}</a>
          </Button>
        ) : null}
        <p className="text-center text-xs text-muted-foreground">
          {t("esim.pay.note", "Your order is created as soon as the payment is confirmed. Do not pay twice for the same order.")}
        </p>
      </CardContent>
    </Card>
  );
}
