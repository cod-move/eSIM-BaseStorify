"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, Link2, Loader2, RotateCcw, Search, Shuffle, Undo2, XCircle } from "lucide-react";
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
import type { QueueRow, QueueView } from "@/lib/esim/admin/queue";

/**
 * eSIM fulfilment that needs a person (ADM-08): what went wrong, what the
 * shopper was refunded, and the ways out — try again, another supplier, an
 * eSIM bought by hand, or give up and refund.
 */

type Dialogue = { row: QueueRow; kind: "switch" | "bind" | "refunded" } | null;

interface Props {
  view: QueueView;
  queue: { rows: QueueRow[]; counts: { attention: number; failed: number; stuck: number }; pagination: { page: number; totalPages: number; total: number } };
  canManage: boolean;
  search: string;
}

export function EsimQueueAdmin({ view, queue, canManage, search: initialSearch }: Props) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { confirm } = useConfirmation();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [dialogue, setDialogue] = useState<Dialogue>(null);
  const [candidate, setCandidate] = useState(0);
  const [iccid, setIccid] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState(initialSearch);
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

  async function act(row: QueueRow, body: Record<string, unknown>, done: string) {
    setBusy(row.id);
    try {
      await apiClient.post(`/api/esim/admin/jobs/${row.id}`, body);
      toast.success(done);
      setDialogue(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  const views: Array<{ id: QueueView; label: string; count?: number }> = [
    { id: "attention", label: t("admin.esim.needsAction", "Needs action"), count: queue.counts.attention },
    { id: "failed", label: t("admin.esim.failed", "Failed"), count: queue.counts.failed },
    { id: "stuck", label: t("admin.esim.stuck", "Stuck"), count: queue.counts.stuck },
    { id: "all", label: t("admin.esim.allJobs", "All fulfilment") },
  ];

  const stateLabel = (row: QueueRow) =>
    row.state === "failed"
      ? t("admin.esim.failed", "Failed")
      : row.state === "provider_pending"
        ? t("admin.esim.waitingSupplier", "Waiting for supplier")
        : row.state === "fulfilled"
          ? t("admin.esim.issuedState", "Issued")
          : t("admin.esim.retrying", "Retrying");

  const refundLabel = (row: QueueRow) => {
    if (!row.refund) return row.state === "failed" ? t("admin.esim.notRefunded", "Not refunded yet") : null;
    if (row.refund.state === "done") return t("admin.esim.refundDone", "Refunded {amount}", { amount: row.refund.amount.toFixed(2) });
    if (row.refund.state === "manual") return t("admin.esim.refundManual", "Refund {amount} by hand", { amount: row.refund.amount.toFixed(2) });
    return t("admin.esim.refundPending", "Refund in progress");
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("admin.sidebar.esimProblems", "Problems")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("admin.esim.problemsHint", "eSIMs that could not be issued, or are taking too long. A failed eSIM of a registered shopper is refunded to store credit on its own; a guest's needs a refund by hand.")}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <form
          className="relative w-full max-w-xs"
          onSubmit={(event) => {
            event.preventDefault();
            navigate({ search: search.trim() || undefined });
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("admin.esim.searchOrder", "Order number")} className="pl-9" />
        </form>
      </div>

      {isPending ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : null}

      {queue.rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{t("admin.esim.noProblems", "Nothing needs a person right now.")}</CardContent>
        </Card>
      ) : (
        queue.rows.map((row) => {
          const current = row.candidates[row.candidateIndex];
          const refunded = row.refund?.state === "done";
          const closed = row.state === "fulfilled" || refunded;
          return (
            <Card key={row.id}>
              <CardContent className="space-y-3 pt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/orders/${row.orderId}`} className="font-semibold hover:underline">{row.orderNumber}</Link>
                      <Badge variant={row.state === "failed" ? "destructive" : "secondary"}>{stateLabel(row)}</Badge>
                      {refundLabel(row) ? <Badge variant={refunded ? "outline" : "default"}>{refundLabel(row)}</Badge> : null}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {row.unit} · {row.customer ?? t("admin.esim.guest", "guest")} · {when(row.createdAt)}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div>
                      {t("admin.esim.currentSupplier", "Supplier")}: <b>{current?.providerCode ?? "?"}</b> ({row.candidateIndex + 1}/{row.candidates.length})
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("admin.esim.attempts", "{count} attempts", { count: row.attempts })}
                      {row.providerOrderId ? ` · ${row.providerOrderId}` : ""}
                    </div>
                  </div>
                </div>

                {row.lastError ? (
                  <div className="flex items-start gap-2 rounded-lg bg-destructive/5 p-2 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <span>
                      <b>{row.lastError.code}</b>: {row.lastError.message}
                      <span className="ml-2 text-xs text-muted-foreground">{when(row.lastError.at)}</span>
                    </span>
                  </div>
                ) : null}
                {row.lastError?.code === "uncertain" || row.providerOrderId ? (
                  <p className="text-xs text-amber-700">
                    {t("admin.esim.mayStillDeliver", "The supplier may still have issued this eSIM. Check its portal before trying another supplier or refunding.")}
                  </p>
                ) : null}

                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">{t("admin.esim.history", "Fulfilment history")}</summary>
                  <ol className="mt-1 space-y-0.5">
                    {row.history.map((entry, index) => (
                      <li key={index}>
                        {when(entry.at)} · {entry.event}
                        {entry.detail ? ` · ${entry.detail}` : ""}
                      </li>
                    ))}
                  </ol>
                </details>

                {canManage && !closed ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={busy !== null} onClick={() => act(row, { action: "retry" }, t("admin.esim.retryStarted", "Trying again"))}>
                      {busy === row.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                      {t("admin.esim.retry", "Try again")}
                    </Button>
                    {row.candidates.length > 1 ? (
                      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => { setCandidate(row.candidateIndex === 0 ? 1 : 0); setDialogue({ row, kind: "switch" }); }}>
                        <Shuffle className="mr-2 h-4 w-4" /> {t("admin.esim.switch", "Another supplier")}
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => { setCandidate(row.candidateIndex); setIccid(""); setDialogue({ row, kind: "bind" }); }}>
                      <Link2 className="mr-2 h-4 w-4" /> {t("admin.esim.bind", "Bind an eSIM bought by hand")}
                    </Button>
                    {row.state !== "failed" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        disabled={busy !== null}
                        onClick={async () => {
                          if (await confirm({ title: t("admin.esim.confirm", "Are you sure?"), description: t("admin.esim.confirmFail", "Stop trying and refund the shopper (store credit; a guest needs a refund by hand)?") })) {
                            await act(row, { action: "fail" }, t("admin.esim.failedDone", "Stopped; the refund follows"));
                          }
                        }}
                      >
                        <XCircle className="mr-2 h-4 w-4" /> {t("admin.esim.giveUp", "Give up and refund")}
                      </Button>
                    ) : null}
                    {row.state === "failed" && row.refund?.state !== "done" ? (
                      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => { setNote(""); setDialogue({ row, kind: "refunded" }); }}>
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

      {queue.pagination.totalPages > 1 ? (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={queue.pagination.page <= 1} onClick={() => navigate({ page: String(queue.pagination.page - 1) })}>‹</Button>
          <span className="text-sm text-muted-foreground">{queue.pagination.page} / {queue.pagination.totalPages}</span>
          <Button size="sm" variant="outline" disabled={queue.pagination.page >= queue.pagination.totalPages} onClick={() => navigate({ page: String(queue.pagination.page + 1) })}>›</Button>
        </div>
      ) : null}

      <Dialog open={dialogue !== null} onOpenChange={(open) => !open && setDialogue(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogue?.kind === "switch"
                ? t("admin.esim.switch", "Another supplier")
                : dialogue?.kind === "bind"
                  ? t("admin.esim.bind", "Bind an eSIM bought by hand")
                  : t("admin.esim.markRefunded", "Mark refunded by hand")}
            </DialogTitle>
          </DialogHeader>
          {dialogue && dialogue.kind !== "refunded" ? (
            <div className="space-y-3 text-sm">
              <div className="space-y-1.5">
                <Label>{t("admin.esim.supplierPlan", "Supplier plan")}</Label>
                <NativeSelect value={String(candidate)} onChange={(event) => setCandidate(Number(event.target.value))}>
                  {dialogue.row.candidates.map((option) => (
                    <option key={option.index} value={option.index}>
                      {option.providerCode} · {option.name}
                      {option.index === dialogue.row.candidateIndex ? ` (${t("admin.esim.current", "current")})` : ""}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              {dialogue.kind === "bind" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="bind-iccid">ICCID</Label>
                  <Input id="bind-iccid" value={iccid} onChange={(event) => setIccid(event.target.value)} placeholder="8985…" />
                  <p className="text-xs text-muted-foreground">
                    {t("admin.esim.bindHint", "The eSIM is read from the chosen supplier by its ICCID, recorded on the order and emailed to the shopper.")}
                  </p>
                </div>
              ) : null}
            </div>
          ) : dialogue ? (
            <div className="space-y-1.5 text-sm">
              <Label htmlFor="refund-note">{t("admin.esim.refundNote", "How it was refunded")}</Label>
              <Input id="refund-note" value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} placeholder={t("admin.esim.refundNoteExample", "e.g. Refunded on Stripe, 25 Oct")} />
            </div>
          ) : null}
          <DialogFooter>
            <Button
              disabled={busy !== null || (dialogue?.kind === "bind" && iccid.trim().length < 10)}
              onClick={() => {
                if (!dialogue) return;
                if (dialogue.kind === "switch") void act(dialogue.row, { action: "switch", candidateIndex: candidate }, t("admin.esim.retryStarted", "Trying again"));
                else if (dialogue.kind === "bind") void act(dialogue.row, { action: "bind", candidateIndex: candidate, iccid: iccid.trim() }, t("admin.esim.bound", "eSIM bound and sent to the shopper"));
                else void act(dialogue.row, { action: "refunded", note }, t("admin.esim.saved", "Saved"));
              }}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("admin.esim.confirmButton", "Confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
