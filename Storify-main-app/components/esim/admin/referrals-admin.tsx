"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Search } from "lucide-react";
import Link from "@/components/language/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast-notification";
import { usePathname, useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api/client";
import type { ReferralSettings } from "@/lib/esim/referral/rules";
import type { CommissionRow, CommissionView } from "@/lib/esim/admin/referrals";

/**
 * Referrals (REF-02..06): the settings — reward, its limits, the holding
 * period, the welcome coupon — and every reward, with the ones to take back
 * by hand after a late refund first.
 */

interface Props {
  settings: ReferralSettings;
  list: { rows: CommissionRow[]; counts: { attention: number; referrals: number }; pagination: { page: number; total: number; totalPages: number } };
  view: CommissionView;
  search: string;
  canManage: boolean;
}

export function EsimReferralsAdmin({ settings, list, view, search: initialSearch, canManage }: Props) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const changed = JSON.stringify(value) !== JSON.stringify(settings);
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");

  const navigate = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, entry] of Object.entries(updates)) {
      if (!entry) params.delete(key);
      else params.set(key, entry);
    }
    if (!("page" in updates)) params.delete("page");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  };

  async function save() {
    setSaving(true);
    try {
      await apiClient.post("/api/esim/admin/referrals", value);
      toast.success(t("admin.esim.saved", "Saved"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function act(row: CommissionRow, action: "cancel" | "settle") {
    setBusy(row.id);
    try {
      await apiClient.post(`/api/esim/admin/referrals/${row.id}`, { action });
      toast.success(t("admin.esim.saved", "Saved"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  const number = (label: string, current: number, onChange: (next: number) => void, suffix?: string, step = "1") => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input type="number" min={0} step={step} className="w-28" disabled={!canManage} value={current} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} />
        {suffix ? <span className="text-sm text-muted-foreground">{suffix}</span> : null}
      </div>
    </div>
  );

  const views: Array<{ id: CommissionView; label: string; count?: number }> = [
    { id: "attention", label: t("admin.esim.referralAttention", "To take back"), count: list.counts.attention },
    { id: "pending", label: t("admin.esim.referralPending", "On hold") },
    { id: "credited", label: t("admin.esim.referralCredited", "Paid") },
    { id: "cancelled", label: t("admin.esim.referralCancelled", "Cancelled") },
    { id: "all", label: t("admin.esim.referralAll", "All rewards") },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("admin.sidebar.esimReferrals", "Referrals")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("admin.esim.referralsHint", "Shoppers share /esim/invite/<code>. A friend who opens an account through it earns them a reward on each order delivered, added to their balance after the holding period — booked as a promotion. {count} shoppers have joined through a referral.", { count: list.counts.referrals })}
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="text-base">{t("admin.esim.referralSettings", "Settings")}</CardTitle>
          <Switch checked={value.enabled} disabled={!canManage} onCheckedChange={(enabled) => setValue({ ...value, enabled })} aria-label={t("admin.esim.referralEnabled", "Referrals on")} />
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t("admin.esim.referralReward", "Reward")}</Label>
              <NativeSelect value={value.commissionType} disabled={!canManage} onChange={(event) => setValue({ ...value, commissionType: event.target.value as ReferralSettings["commissionType"] })}>
                <option value="percent">{t("admin.esim.referralPercent", "% of each order")}</option>
                <option value="fixed">{t("admin.esim.referralFixed", "Fixed amount per order")}</option>
              </NativeSelect>
            </div>
            {value.commissionType === "percent"
              ? number(t("admin.esim.referralValue", "Value"), value.commissionValue, (next) => setValue({ ...value, commissionValue: Math.min(100, next) }), "%", "0.1")
              : number(t("admin.esim.referralValue", "Value"), value.commissionValue / 100, (next) => setValue({ ...value, commissionValue: Math.round(next * 100) }), "USD", "0.01")}
            {number(t("admin.esim.referralHold", "Holding period"), value.holdDays, (next) => setValue({ ...value, holdDays: Math.round(next) }), t("admin.esim.days", "days"))}
            {number(t("admin.esim.referralValidity", "Earns for"), value.validityDays, (next) => setValue({ ...value, validityDays: Math.round(next) }), t("admin.esim.referralDaysAfter", "days after joining (0 = always)"))}
            {number(t("admin.esim.referralLimit", "Orders that earn"), value.orderLimit, (next) => setValue({ ...value, orderLimit: Math.round(next) }), t("admin.esim.referralLimitHint", "first orders (0 = all)"))}
          </div>
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-medium">{t("admin.esim.referralCoupon", "Welcome coupon for the friend")}</div>
                <p className="text-xs text-muted-foreground">{t("admin.esim.referralCouponHint", "A one-use coupon for their account only, made when they sign up through a link.")}</p>
              </div>
              <Switch checked={value.coupon.enabled} disabled={!canManage} onCheckedChange={(enabled) => setValue({ ...value, coupon: { ...value.coupon, enabled } })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label>{t("admin.esim.referralDiscount", "Discount")}</Label>
                <NativeSelect value={value.coupon.type} disabled={!canManage} onChange={(event) => setValue({ ...value, coupon: { ...value.coupon, type: event.target.value as ReferralSettings["coupon"]["type"] } })}>
                  <option value="percentage">%</option>
                  <option value="fixed">USD</option>
                </NativeSelect>
              </div>
              {value.coupon.type === "percentage"
                ? number(t("admin.esim.referralValue", "Value"), value.coupon.value, (next) => setValue({ ...value, coupon: { ...value.coupon, value: Math.min(100, next) } }), "%")
                : number(t("admin.esim.referralValue", "Value"), value.coupon.value / 100, (next) => setValue({ ...value, coupon: { ...value.coupon, value: Math.round(next * 100) } }), "USD", "0.01")}
              {number(t("admin.esim.referralCouponDays", "Valid for"), value.coupon.days, (next) => setValue({ ...value, coupon: { ...value.coupon, days: Math.max(1, Math.round(next)) } }), t("admin.esim.days", "days"))}
              {number(t("admin.esim.referralMinOrder", "Minimum order"), value.coupon.minOrderMinor / 100, (next) => setValue({ ...value, coupon: { ...value.coupon, minOrderMinor: Math.round(next * 100) } }), "USD", "0.01")}
            </div>
          </div>
          {canManage ? (
            <Button size="sm" onClick={save} disabled={!changed || saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("common.save", "Save")}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {views.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => navigate({ view: entry.id === "attention" ? undefined : entry.id })}
              className={cn("rounded-full border px-3 py-1 text-sm", view === entry.id ? "border-primary bg-primary/10 font-medium" : "hover:border-foreground/40")}
            >
              {entry.label}
              {entry.count !== undefined ? <span className="ml-1 text-xs text-muted-foreground">({entry.count})</span> : null}
            </button>
          ))}
        </div>
        <form className="relative w-full max-w-xs" onSubmit={(event) => { event.preventDefault(); navigate({ search: search.trim() || undefined }); }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("admin.esim.referralSearch", "Order or email")} className="pl-9" />
        </form>
      </div>
      {isPending ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : null}

      <Card>
        <CardContent className="pt-6">
          {list.rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("admin.esim.referralNone", "No rewards here.")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.esim.orderNumber", "Order")}</TableHead>
                  <TableHead>{t("admin.esim.referralReferrer", "Referrer")}</TableHead>
                  <TableHead>{t("admin.esim.referralReferee", "Friend")}</TableHead>
                  <TableHead className="text-right">{t("admin.esim.referralAmount", "Reward")}</TableHead>
                  <TableHead>{t("admin.esim.status", "Status")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell><Link href={`/admin/orders/${row.orderId}`} className="hover:underline">{row.orderNumber}</Link><div className="text-xs text-muted-foreground">{when(row.createdAt)}</div></TableCell>
                    <TableCell className="text-sm">{row.referrer ?? "—"}</TableCell>
                    <TableCell className="text-sm">{row.referee ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {row.amount.toFixed(2)} {row.currency}
                      <div className="text-xs text-muted-foreground">{t("admin.esim.referralOn", "on {base}", { base: row.base.toFixed(2) })}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status === "cancelled" ? "outline" : row.status === "credited" ? "secondary" : "default"}>
                        {row.status === "pending" ? t("admin.esim.referralPending", "On hold") : row.status === "credited" ? t("admin.esim.referralCredited", "Paid") : t("admin.esim.referralCancelled", "Cancelled")}
                      </Badge>
                      <div className="text-xs text-muted-foreground">
                        {row.status === "pending" ? t("admin.esim.referralFrom", "from {date}", { date: when(row.payableAt) }) : row.status === "credited" ? when(row.creditedAt) : row.note ?? ""}
                      </div>
                      {row.clawback && !row.clawback.settled ? (
                        <div className="text-xs text-destructive">{t("admin.esim.referralTakeBack", "Refunded later: take back {amount}", { amount: row.clawback.amount.toFixed(2) })}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage && row.status === "pending" ? (
                        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act(row, "cancel")}>{t("admin.esim.referralCancel", "Cancel")}</Button>
                      ) : null}
                      {canManage && row.clawback && !row.clawback.settled ? (
                        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => act(row, "settle")}>{t("admin.esim.referralSettle", "Dealt with")}</Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {list.pagination.totalPages > 1 ? (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={list.pagination.page <= 1} onClick={() => navigate({ page: String(list.pagination.page - 1) })}>‹</Button>
          <span className="text-sm text-muted-foreground">{list.pagination.page} / {list.pagination.totalPages}</span>
          <Button size="sm" variant="outline" disabled={list.pagination.page >= list.pagination.totalPages} onClick={() => navigate({ page: String(list.pagination.page + 1) })}>›</Button>
        </div>
      ) : null}
    </div>
  );
}
