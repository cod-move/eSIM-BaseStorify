"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, Loader2, RotateCcw, Search, Undo2, XCircle } from "lucide-react";
import Link from "@/components/language/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toast-notification";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { usePathname, useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api/client";
import type { TopupList, TopupRow, TopupView } from "@/lib/esim/admin/topups";

/**
 * Every eSIM top-up (TOP-06) and the ones that need a person: what went
 * wrong, whether the shopper was refunded, and the ways out — try again
 * (same supplier, same key, so never twice), give up and refund, or record a
 * refund made by hand.
 */

interface Props {
  view: TopupView;
  list: TopupList;
  canManage: boolean;
  filters: { search?: string; provider?: string; from?: string; to?: string };
}

const money = (minor: number, currency = "USD") => `${(minor / 100).toFixed(2)} ${currency}`;

export function EsimTopupsAdmin({ view, list, canManage, filters }: Props) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { confirm } = useConfirmation();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<TopupRow | null>(null);
  const [note, setNote] = useState("");
  const [search, setSearch] = useState(filters.search ?? "");
  const when = (value: string | null) => (value ? new Date(value).toLocaleString() : "—");

  const navigate = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    if (!("page" in updates)) params.delete("page");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  };

  async function act(row: TopupRow, body: Record<string, unknown>, done: string) {
    setBusy(row.id);
    try {
      await apiClient.post(`/api/esim/admin/topups/${row.id}`, body);
      toast.success(done);
      setRefunding(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  const views: Array<{ id: TopupView; label: string; count?: number }> = [
    { id: "attention", label: t("admin.esim.needsAction", "Needs action"), count: list.counts.attention },
    { id: "failed", label: t("admin.esim.failed", "Failed"), count: list.counts.failed },
    { id: "stuck", label: t("admin.esim.stuck", "Stuck"), count: list.counts.stuck },
    { id: "completed", label: t("admin.esim.topupCompleted", "Completed") },
    { id: "all", label: t("admin.esim.allTopups", "All top-ups") },
  ];

  const stateLabel = (row: TopupRow) =>
    row.state === "failed"
      ? t("admin.esim.failed", "Failed")
      : row.state === "completed"
        ? t("admin.esim.topupCompleted", "Completed")
        : row.state === "processing"
          ? t("admin.esim.topupProcessing", "At the supplier")
          : t("admin.esim.topupQueued", "Paid, queued");

  const refundLabel = (row: TopupRow) => {
    if (!row.refund) return row.state === "failed" ? t("admin.esim.notRefunded", "Not refunded yet") : null;
    if (row.refund.state === "done") return t("admin.esim.refundDone", "Refunded {amount}", { amount: row.refund.amount.toFixed(2) });
    if (row.refund.state === "manual") return t("admin.esim.refundManual", "Refund {amount} by hand", { amount: row.refund.amount.toFixed(2) });
    return t("admin.esim.refundPending", "Refund in progress");
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("admin.sidebar.esimTopups", "Top-ups")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("admin.esim.topupsHint", "Data top-ups shoppers bought for their eSIMs. A failed top-up is refunded to the shopper's store credit on its own.")}
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {views.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => navigate({ view: entry.id === "attention" ? undefined : entry.id })}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              view === entry.id ? "border-primary bg-primary/10 font-medium" : "hover:border-foreground/40",
            )}
          >
            {entry.label}
            {entry.count !== undefined ? <span className="ml-1 text-xs text-muted-foreground">({entry.count})</span> : null}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <form
          className="relative w-full max-w-xs"
          onSubmit={(event) => {
            event.preventDefault();
            navigate({ search: search.trim() || undefined });
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("admin.esim.searchTopups", "Order, ICCID or email")}
            className="pl-9"
          />
        </form>
        <NativeSelect
          aria-label={t("admin.esim.supplier", "Supplier")}
          value={filters.provider ?? ""}
          onChange={(event) => navigate({ provider: event.target.value || undefined })}
          className="w-40"
        >
          <option value="">{t("admin.esim.allSuppliers", "All suppliers")}</option>
          {list.providers.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </NativeSelect>
        <div className="flex items-center gap-2 text-sm">
          <Input type="date" aria-label={t("admin.esim.from", "From")} value={filters.from ?? ""} onChange={(event) => navigate({ from: event.target.value || undefined })} className="w-40" />
          <span className="text-muted-foreground">–</span>
          <Input type="date" aria-label={t("admin.esim.to", "To")} value={filters.to ?? ""} onChange={(event) => navigate({ to: event.target.value || undefined })} className="w-40" />
        </div>
        {isPending ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : null}
      </div>

      {list.rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {view === "attention" ? t("admin.esim.noTopupProblems", "No top-up needs a person right now.") : t("admin.esim.noTopups", "No top-ups match.")}
          </CardContent>
        </Card>
      ) : (
        list.rows.map((row) => {
          const refunded = row.refund?.state === "done";
          const open = row.state !== "completed" && !refunded;
          return (
            <Card key={row.id}>
              <CardContent className="space-y-3 pt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/orders/${row.orderId}`} className="font-semibold hover:underline">{row.orderNumber}</Link>
                      <Badge variant={row.state === "failed" ? "destructive" : row.state === "completed" ? "outline" : "secondary"}>{stateLabel(row)}</Badge>
                      {refundLabel(row) ? <Badge variant={refunded ? "outline" : "default"}>{refundLabel(row)}</Badge> : null}
                    </div>
                    <div className="text-sm">
                      {row.name} · {row.mode === "addon" ? t("admin.esim.topupAddon", "own package") : t("admin.esim.topupStack", "adds to the plan")}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {row.esimId ? (
                        <Link href={`/admin/esim/esims/${row.esimId}`} className="font-mono hover:underline">{row.iccid ?? row.esimId}</Link>
                      ) : (
                        row.iccid ?? "—"
                      )}
                      {" · "}
                      {row.customer ?? "—"} · {when(row.createdAt)}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div>
                      <b>{money(row.priceMinor)}</b>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {t("admin.esim.topupCost", "cost")} {money(row.cost.amountMinor, row.cost.currency)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.providerCode} · {t("admin.esim.attempts", "{count} attempts", { count: row.attempts })}
                      {row.providerTopupId ? ` · ${row.providerTopupId}` : ""}
                    </div>
                  </div>
                </div>

                {row.lastError && row.state !== "completed" ? (
                  <div className="flex items-start gap-2 rounded-lg bg-destructive/5 p-2 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <span>
                      <b>{row.lastError.code}</b>: {row.lastError.message}
                      <span className="ml-2 text-xs text-muted-foreground">{when(row.lastError.at)}</span>
                    </span>
                  </div>
                ) : null}
                {open && (row.lastError?.code === "uncertain" || row.providerTopupId) ? (
                  <p className="text-xs text-amber-700">
                    {t("admin.esim.topupMayHaveHappened", "The supplier may already have made this top-up. Check its portal before refunding; trying again is safe.")}
                  </p>
                ) : null}

                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">{t("admin.esim.topupHistory", "Top-up history")}</summary>
                  <ol className="mt-1 space-y-0.5">
                    {row.history.map((entry, index) => (
                      <li key={index}>
                        {when(entry.at)} · {entry.event}
                        {entry.detail ? ` · ${entry.detail}` : ""}
                      </li>
                    ))}
                  </ol>
                </details>

                {canManage && open ? (
                  <div className="flex flex-wrap gap-2">
                    {row.lastError?.code !== "invalid" ? (
                      <Button size="sm" disabled={busy !== null} onClick={() => act(row, { action: "retry" }, t("admin.esim.retryStarted", "Trying again"))}>
                        {busy === row.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                        {t("admin.esim.retry", "Try again")}
                      </Button>
                    ) : null}
                    {row.state !== "failed" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        disabled={busy !== null}
                        onClick={async () => {
                          if (await confirm({ title: t("admin.esim.confirm", "Are you sure?"), description: t("admin.esim.confirmFailTopup", "Stop trying and refund the shopper's store credit?") })) {
                            await act(row, { action: "fail" }, t("admin.esim.failedDone", "Stopped; the refund follows"));
                          }
                        }}
                      >
                        <XCircle className="mr-2 h-4 w-4" /> {t("admin.esim.giveUp", "Give up and refund")}
                      </Button>
                    ) : null}
                    {row.state === "failed" ? (
                      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => { setNote(""); setRefunding(row); }}>
                        <Undo2 className="mr-2 h-4 w-4" /> {t("admin.esim.markRefunded", "Mark refunded by hand")}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })
      )}

      {list.pagination.totalPages > 1 ? (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={list.pagination.page <= 1} onClick={() => navigate({ page: String(list.pagination.page - 1) })}>‹</Button>
          <span className="text-sm text-muted-foreground">{list.pagination.page} / {list.pagination.totalPages}</span>
          <Button size="sm" variant="outline" disabled={list.pagination.page >= list.pagination.totalPages} onClick={() => navigate({ page: String(list.pagination.page + 1) })}>›</Button>
        </div>
      ) : null}

      <Dialog open={refunding !== null} onOpenChange={(value) => !value && setRefunding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.esim.markRefunded", "Mark refunded by hand")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 text-sm">
            <Label htmlFor="topup-refund-note">{t("admin.esim.refundNote", "How it was refunded")}</Label>
            <Input id="topup-refund-note" value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} placeholder={t("admin.esim.refundNoteExample", "e.g. Refunded on Stripe, 25 Oct")} />
          </div>
          <DialogFooter>
            <Button disabled={busy !== null} onClick={() => refunding && act(refunding, { action: "refunded", note }, t("admin.esim.saved", "Saved"))}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("admin.esim.confirmButton", "Confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
