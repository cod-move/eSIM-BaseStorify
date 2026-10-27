"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, RotateCcw, Save, Undo2 } from "lucide-react";
import Link from "@/components/language/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast-notification";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api/client";
import type { AdminPayment, AdminPaymentMethod } from "@/lib/esim/admin/payments";

/**
 * The payment methods behind Storify's "More ways to pay" (PAY, patch P15)
 * and the payments made with them. A secret is never sent back to the page —
 * its field shows whether one is set, and stays untouched unless typed into.
 */

function MethodCard({ method, canManage }: { method: AdminPaymentMethod; canManage: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [name, setName] = useState(method.name === method.defaultName ? "" : method.name);
  const [sort, setSort] = useState(String(method.sort));
  const [credentials, setCredentials] = useState<Record<string, string>>(method.credentialValues);
  const [busy, setBusy] = useState(false);
  const notifyUrl = typeof window === "undefined" ? method.notifyPath : `${window.location.origin}${method.notifyPath}`;

  async function patch(body: Record<string, unknown>, done?: string) {
    setBusy(true);
    try {
      await apiClient.patch(`/api/esim/admin/payments/methods/${method.code}`, body);
      if (done) toast.success(done);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const save = () => {
    const changed = Object.fromEntries(
      Object.entries(credentials).filter(([key, value]) => (method.secretKeys.includes(key) ? value !== "" : value !== (method.credentialValues[key] ?? ""))),
    );
    void patch({ name, sort: Number(sort) || 0, credentials: changed }, t("admin.esim.saved", "Saved"));
    setCredentials(method.credentialValues);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            {method.name}
            <Badge variant={method.status === "active" ? "default" : "secondary"}>
              {method.status === "active" ? t("admin.esim.active", "On") : t("admin.esim.disabled", "Off")}
            </Badge>
          </CardTitle>
          {method.missing.length ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {t("admin.esim.payMissing", "Still to fill in: {fields}", { fields: method.missing.join(", ") })}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`pay-${method.code}`} className="text-sm">{t("admin.esim.payOffered", "Offered")}</Label>
          <Switch
            id={`pay-${method.code}`}
            checked={method.status === "active"}
            disabled={!canManage || busy || (method.missing.length > 0 && method.status !== "active")}
            onCheckedChange={(on) => void patch({ status: on ? "active" : "disabled" })}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${method.code}-name`}>{t("admin.esim.payName", "Name shown to shoppers")}</Label>
            <Input id={`${method.code}-name`} disabled={!canManage} value={name} placeholder={method.defaultName} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${method.code}-sort`}>{t("admin.esim.paySort", "Order on the payment page (lower first)")}</Label>
            <Input id={`${method.code}-sort`} type="number" min={0} disabled={!canManage} value={sort} onChange={(event) => setSort(event.target.value)} />
          </div>
          {method.credentialKeys.map((key) => {
            const secret = method.secretKeys.includes(key);
            return (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`${method.code}-${key}`}>{key}</Label>
                <Input
                  id={`${method.code}-${key}`}
                  type={secret ? "password" : "text"}
                  autoComplete="off"
                  disabled={!canManage}
                  value={credentials[key] ?? ""}
                  placeholder={
                    secret
                      ? method.credentialsSet[key]
                        ? t("admin.esim.secretSet", "Set — type to replace")
                        : t("admin.esim.secretUnset", "Not set")
                      : (method.defaults[key] ?? "")
                  }
                  onChange={(event) => setCredentials((current) => ({ ...current, [key]: event.target.value }))}
                />
              </div>
            );
          })}
        </div>
        <p className="break-all text-xs text-muted-foreground">
          {t("admin.esim.payNotify", "Notification URL (the gateway posts here): {url}", { url: notifyUrl })}
        </p>
        {canManage ? (
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {t("admin.esim.save", "Save")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

const OUTCOME_TONE: Record<string, string> = {
  order: "text-emerald-700 dark:text-emerald-400",
  duplicate: "text-destructive",
  closed: "text-destructive",
};

export function EsimPaymentsAdmin({ methods, payments, attention, canManage }: { methods: AdminPaymentMethod[]; payments: AdminPayment[]; attention: boolean; canManage: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const { confirm } = useConfirmation();
  const [busy, setBusy] = useState<string | null>(null);
  const when = (value: string | null) => (value ? new Date(value).toLocaleString() : "—");
  const money = (row: AdminPayment) => `${(row.amountMinor / 100).toFixed(2)} ${row.currency}`;
  const methodName = (code: string) => methods.find((method) => method.code === code)?.name ?? code;
  const outcomeText = (row: AdminPayment) =>
    row.outcome === "order"
      ? t("admin.esim.payOutcomeOrder", "Order placed")
      : row.outcome === "duplicate"
        ? t("admin.esim.payOutcomeDuplicate", "Paid twice — send it back")
        : row.outcome === "closed"
          ? t("admin.esim.payOutcomeClosed", "Checkout had closed — send it back")
          : row.state === "paid"
            ? t("admin.esim.payOutcomeUnsettled", "Paid, order not placed yet")
            : row.state;

  async function act(row: AdminPayment, action: "refunded" | "settle") {
    if (action === "refunded") {
      const ok = await confirm({
        title: t("admin.esim.confirm", "Are you sure?"),
        description: t("admin.esim.payConfirmRefunded", "Record that {amount} was sent back to the shopper through {method}?", { amount: money(row), method: methodName(row.method) }),
      });
      if (!ok) return;
    }
    setBusy(row.id);
    try {
      await apiClient.post(`/api/esim/admin/payments/${row.id}`, { action });
      toast.success(t("admin.esim.saved", "Saved"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("admin.sidebar.esimPayments", "Payments")}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "admin.esim.paymentsHint",
            "The methods offered at checkout as “More ways to pay”. The shopper picks one on the eSIM payment page; the order is placed when the gateway confirms the payment. Refunds of these payments are made by hand in the gateway.",
          )}
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {methods.map((method) => (
          <MethodCard key={method.code} method={method} canManage={canManage} />
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold">{t("admin.esim.payList", "Payments")}</h2>
          <Button asChild size="sm" variant={attention ? "default" : "outline"}>
            <Link href="/admin/esim/payments">{t("admin.esim.payAttention", "Needs attention")}</Link>
          </Button>
          <Button asChild size="sm" variant={attention ? "outline" : "default"}>
            <Link href="/admin/esim/payments?view=all">{t("admin.esim.payAll", "Latest 100")}</Link>
          </Button>
        </div>
        <Card>
          <CardContent className="overflow-x-auto p-0">
            {payments.length ? (
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3">{t("admin.esim.payReference", "Reference")}</th>
                    <th className="p-3">{t("admin.esim.payMethod", "Method")}</th>
                    <th className="p-3">{t("admin.esim.payAmount", "Amount")}</th>
                    <th className="p-3">{t("admin.esim.payResult", "Result")}</th>
                    <th className="p-3">{t("admin.esim.payWhen", "Started")}</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {payments.map((row) => (
                    <tr key={row.id} className="border-b last:border-0 align-top">
                      <td className="p-3">
                        <div className="font-mono">{row.reference}</div>
                        {row.gatewayPaymentId ? <div className="font-mono text-xs text-muted-foreground">{row.gatewayPaymentId}</div> : null}
                        {row.email ? <div className="text-xs text-muted-foreground">{row.email}</div> : null}
                      </td>
                      <td className="p-3">{methodName(row.method)}</td>
                      <td className="p-3 whitespace-nowrap">{money(row)}</td>
                      <td className="p-3">
                        <div className={cn(OUTCOME_TONE[row.outcome ?? ""])}>{outcomeText(row)}</div>
                        {row.orderId ? (
                          <Link href={`/admin/orders/${row.orderId}`} className="text-xs hover:underline">
                            {row.orderNumber || row.orderId}
                          </Link>
                        ) : null}
                        {row.refundedAt ? <div className="text-xs text-muted-foreground">{t("admin.esim.payRefundedAt", "Sent back {time}", { time: when(row.refundedAt) })}</div> : null}
                        {row.error ? <div className="text-xs text-destructive">{row.error}</div> : null}
                      </td>
                      <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">
                        {when(row.createdAt)}
                        {row.paidAt ? <div>{t("admin.esim.payPaidAt", "Paid {time}", { time: when(row.paidAt) })}</div> : null}
                      </td>
                      <td className="p-3 text-right">
                        {canManage && row.state === "paid" && !row.outcome ? (
                          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void act(row, "settle")}>
                            {busy === row.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                            {t("admin.esim.paySettle", "Place the order now")}
                          </Button>
                        ) : null}
                        {canManage && row.needsRefund ? (
                          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void act(row, "refunded")}>
                            {busy === row.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4" />}
                            {t("admin.esim.payMarkRefunded", "Mark sent back")}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {attention ? t("admin.esim.payNothing", "No payment needs attention.") : t("admin.esim.payNone", "No payments yet.")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
