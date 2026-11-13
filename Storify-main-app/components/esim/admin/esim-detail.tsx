"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Ban, CheckCircle2, Loader2, Mail, RefreshCw, XCircle } from "lucide-react";
import Link from "@/components/language/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast-notification";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { EsimStatusBadge, UsageBar } from "@/components/esim/esim-status-badge";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import { formatBytes, remainingPercent, type Display } from "@/lib/esim/account/display";

/* eslint-disable @typescript-eslint/no-explicit-any -- the detail is the serialised documents, shown as they are */
type Detail = {
  profile: any;
  customer: { email: string; name: string | null; customerId: string | null } | null;
  plan: any;
  display: Display;
  packages: any[];
  job: any;
  logs: Array<{ id: string; operation: string; ok: boolean; durationMs: number; errorCode: string | null; errorMessage: string | null; createdAt: string }>;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/** One eSIM for an admin (ADM-07): what it is, where it stands, what happened to it. */
export function EsimAdminDetail({ detail, canManage }: { detail: Detail; canManage: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const { confirm } = useConfirmation();
  const [busy, setBusy] = useState<string | null>(null);
  const { profile, plan, job } = detail;
  const when = (value: string | null | undefined) => (value ? new Date(value).toLocaleString() : "—");
  const percent = remainingPercent(profile.usage?.totalBytes, profile.usage?.remainingBytes);

  async function act(action: "refresh" | "resend" | "cancel") {
    if (action === "cancel" && !(await confirm({ title: t("admin.esim.confirm", "Are you sure?"), description: t("admin.esim.confirmCancel", "Cancel this eSIM at the supplier? It stops working; refund the shopper separately if needed.") }))) return;
    setBusy(action);
    try {
      const result = await apiClient.post<Record<string, unknown>>(`/api/esim/admin/esims/${profile._id}/${action}`, {});
      if (action === "refresh") {
        if (result.refreshed) toast.success(t("admin.esim.refreshed", "Usage updated"));
        else toast.info(String(result.error ?? t("admin.esim.notRefreshed", "Nothing new from the supplier")));
      } else if (action === "resend") {
        if (result.sent) toast.success(t("admin.esim.resent", "Delivery email sent"));
        else toast.error(t("admin.esim.notResent", "The email could not be sent; check the order's email address and the mail settings"));
      } else {
        if (result.cancelled) toast.success(String(result.message));
        else toast.error(String(result.message));
      }
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/esim/esims" className="text-sm text-muted-foreground hover:underline">
            ← {t("admin.sidebar.esimEsims", "eSIMs")}
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{plan?.title ?? "eSIM"}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <EsimStatusBadge display={detail.display} label={t(`esim.status.${detail.display.status}`, detail.display.label)} />
            <span className="font-mono">{profile.iccid ?? "—"}</span>
          </div>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy !== null || profile.status !== "fulfilled"} onClick={() => act("refresh")}>
              {busy === "refresh" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {t("admin.esim.refresh", "Refresh usage")}
            </Button>
            <Button variant="outline" disabled={busy !== null || profile.status !== "fulfilled"} onClick={() => act("resend")}>
              {busy === "resend" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              {t("admin.esim.resend", "Resend delivery email")}
            </Button>
            <Button variant="outline" className="text-destructive" disabled={busy !== null || profile.lifecycle?.status === "cancelled"} onClick={() => act("cancel")}>
              {busy === "cancel" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
              {t("admin.esim.cancel", "Cancel at supplier")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.esim.overview", "Overview")}</CardTitle>
          </CardHeader>
          <CardContent>
            {row(t("admin.esim.order", "Order"), profile.orderNumber.startsWith("LEGACY-") ? profile.orderNumber : <Link href={`/admin/orders/${profile.order}`} className="hover:underline">{profile.orderNumber}</Link>)}
            {row(
              t("admin.esim.customer", "Customer"),
              detail.customer?.customerId ? (
                <Link href={`/admin/customers/${detail.customer.customerId}`} className="text-store-link hover:underline">
                  {detail.customer.email}
                </Link>
              ) : (
                detail.customer?.email ?? "—"
              ),
            )}
            {row(t("admin.esim.supplier", "Supplier"), `${profile.providerCode} · ${plan?.providerPlanId ?? "—"}`)}
            {row(t("admin.esim.supplierOrder", "Supplier order"), <span className="font-mono text-xs">{profile.providerOrderId ?? "—"}</span>)}
            {row(t("admin.esim.issued", "Issued"), when(profile.fulfilledAt))}
            {row(t("admin.esim.expires", "Expires"), when(profile.expiresAt))}
            {row(t("admin.esim.installBefore", "Install before"), when(profile.activationDeadline))}
            {row(t("admin.esim.topupBefore", "Top up before"), when(profile.topupDeadline))}
            {row(t("admin.esim.remark", "Shopper's name for it"), profile.remark ?? "—")}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.esim.usage", "Usage and device")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {profile.usage?.totalBytes ? (
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span>{formatBytes(profile.usage.remainingBytes)} {t("admin.esim.left", "left")}</span>
                  <span className="text-muted-foreground">/ {formatBytes(profile.usage.totalBytes)}</span>
                </div>
                {percent !== null ? <UsageBar percent={percent} /> : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("admin.esim.noUsage", "No usage reported yet")}</p>
            )}
            <div>
              {row(t("admin.esim.lifecycle", "Use"), profile.lifecycle?.status ?? "—")}
              {row(t("admin.esim.profileStatus", "On the phone"), profile.lifecycle?.profileStatus ?? "—")}
              {row(t("admin.esim.installedAt", "Installed"), when(profile.lifecycle?.installationDetectedAt))}
              {row(t("admin.esim.activatedAt", "First connected"), when(profile.lifecycle?.activationDetectedAt))}
              {row(t("admin.esim.syncedAt", "Last read from supplier"), when(profile.lifecycle?.lastUsageUpdateAt))}
              {row("SM-DP+", <span className="font-mono text-xs">{profile.installation?.smdpAddress ?? "—"}</span>)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.esim.history", "Fulfilment history")}</CardTitle>
          </CardHeader>
          <CardContent>
            {job ? (
              <ol className="space-y-1.5 text-sm">
                {job.history.map((entry: { at: string; event: string; detail?: string }, index: number) => (
                  <li key={index} className="flex justify-between gap-3">
                    <span>
                      {entry.event}
                      {entry.detail ? <span className="text-muted-foreground"> · {entry.detail}</span> : null}
                    </span>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">{when(entry.at)}</span>
                  </li>
                ))}
                {job.refund ? (
                  <li className="pt-2 text-sm">
                    {t("admin.esim.refundState", "Refund")}: {job.refund.state} · {job.refund.amount}
                    {job.refund.note ? ` · ${job.refund.note}` : ""}
                  </li>
                ) : null}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t("admin.esim.calls", "Supplier calls")}</CardTitle>
            <Link href={`/admin/esim/logs?search=${encodeURIComponent(profile.iccid ?? profile.orderNumber)}`} className="text-sm text-store-link hover:underline">
              {t("admin.esim.allCalls", "All calls")}
            </Link>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {detail.logs.map((log) => (
                <li key={log.id} className="flex items-start justify-between gap-3">
                  <span className="flex items-start gap-1.5">
                    {log.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                    <span>
                      {log.operation}
                      {log.errorMessage ? <span className="block text-xs text-destructive">{log.errorMessage}</span> : null}
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {log.durationMs} ms · {when(log.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
