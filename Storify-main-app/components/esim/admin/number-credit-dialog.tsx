"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Minus, Plus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast-notification";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { parseCardAmount } from "@/lib/esim/numbers/op-policy";
import { cardAdjustmentProblem, type AdjustDirection } from "@/lib/esim/numbers/adjust-policy";

/**
 * Admin → eSIM → Numbers → Card credit: a number card's balance at
 * TopConnect, with "Add credit" and "Deduct credit" (amount, reason,
 * confirmed), and the latest changes admins made
 * (GET/POST /api/esim/admin/numbers/[id]/credit).
 */

type Adjustment = {
  id: string;
  direction: AdjustDirection;
  amountMinor: number;
  currency: string;
  reason: string;
  admin: string | null;
  state: "queued" | "processing" | "completed" | "failed" | "manual";
  message: string | null;
  balanceBeforeMinor: number | null;
  balanceAfterMinor: number | null;
  createdAt: string;
};

type CardView = {
  title: string;
  balanceMinor: number | null;
  currency: string;
  blocked: boolean | null;
  checkedAt: string | null;
  adjustments: Adjustment[];
};

const amountText = (minor: number, currency: string) => `${(minor / 100).toFixed(2)} ${currency}`;

const newRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function fetchView(numberId: string, refresh: boolean): Promise<CardView> {
  const res = await fetch(`/api/esim/admin/numbers/${numberId}/credit${refresh ? "?refresh=1" : ""}`);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) throw new Error(data?.message || data?.error || "");
  return data.data as CardView;
}

type DialogProps = {
  /** The number to show; null keeps the dialog closed. */
  numberId: string | null;
  title: string;
  canManage: boolean;
  onClose: () => void;
};

export function NumberCreditDialog(props: DialogProps) {
  // Mounted afresh for each number: its state starts empty.
  return props.numberId ? <CardCreditDialog key={props.numberId} {...props} numberId={props.numberId} /> : null;
}

function CardCreditDialog({ numberId, title, canManage, onClose }: DialogProps & { numberId: string }) {
  const t = useFallbackTranslator(useTranslations());
  const { confirm } = useConfirmation();
  const [view, setView] = useState<CardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [direction, setDirection] = useState<AdjustDirection>("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [requestId, setRequestId] = useState(newRequestId);
  const [saving, setSaving] = useState(false);

  const loadFailed = useCallback(
    (error: unknown) => toast.error((error instanceof Error && error.message) || t("admin.esim.cardCredit.loadFailed", "The card could not be read")),
    [t],
  );

  const load = async (refresh: boolean) => {
    setLoading(true);
    try {
      setView(await fetchView(numberId, refresh));
    } catch (error) {
      loadFailed(error);
    } finally {
      setLoading(false);
    }
  };

  // Read from TopConnect on opening.
  useEffect(() => {
    let cancelled = false;
    fetchView(numberId, true)
      .then((next) => {
        if (!cancelled) setView(next);
      })
      .catch((error) => {
        if (!cancelled) loadFailed(error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [numberId, loadFailed]);

  const stateLabel = (state: Adjustment["state"]) =>
    ({
      completed: t("admin.esim.cardCredit.stateCompleted", "Done"),
      failed: t("admin.esim.cardCredit.stateFailed", "Refused"),
      manual: t("admin.esim.cardCredit.stateManual", "Check by hand"),
      queued: t("admin.esim.cardCredit.stateWaiting", "Waiting"),
      processing: t("admin.esim.cardCredit.stateWaiting", "Waiting"),
    })[state];

  async function submit() {
    if (!view) return;
    const amountMinor = parseCardAmount(amount);
    if (amountMinor === null) {
      toast.error(t("admin.esim.cardCredit.invalidAmount", "Enter an amount, like 12.50"));
      return;
    }
    const problem = cardAdjustmentProblem({ direction, amountMinor, balanceMinor: view.balanceMinor, blocked: view.blocked });
    if (problem) {
      toast.error(problem);
      return;
    }
    if (!reason.trim()) {
      toast.error(t("admin.esim.cardCredit.reasonRequired", "Say why the card's credit changes"));
      return;
    }
    const money = amountText(amountMinor, view.currency);
    const before = view.balanceMinor;
    const after = before === null ? null : direction === "add" ? before + amountMinor : before - amountMinor;
    const ok = await confirm({
      type: direction === "deduct" ? "danger" : "warning",
      title:
        direction === "add"
          ? t("admin.esim.cardCredit.confirmAdd", "Add {amount} to {number}?", { amount: money, number: title })
          : t("admin.esim.cardCredit.confirmDeduct", "Deduct {amount} from {number}?", { amount: money, number: title }),
      description:
        before === null || after === null
          ? t("admin.esim.cardCredit.confirmNoBalance", "The money moves at TopConnect right away.")
          : t("admin.esim.cardCredit.confirmText", "The money moves at TopConnect right away: {from} on the card now, {to} after.", {
              from: amountText(before, view.currency),
              to: amountText(after, view.currency),
            }),
      confirmText: direction === "add" ? t("admin.esim.cardCredit.add", "Add credit") : t("admin.esim.cardCredit.deduct", "Deduct credit"),
      confirmVariant: direction === "deduct" ? "destructive" : "default",
    });
    if (!ok) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/esim/admin/numbers/${numberId}/credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction, amountMinor, reason: reason.trim(), requestId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.message || data?.error || "");
      const state = (data.data?.adjustment as Adjustment | undefined)?.state;
      if (state === "completed") toast.success(t("admin.esim.cardCredit.done", "Card credit changed"));
      else if (state === "manual") toast.error(t("admin.esim.cardCredit.manual", "Not settled: check TopConnect by hand."));
      else toast.info(t("admin.esim.cardCredit.pending", "Sent; TopConnect has not confirmed yet. It is retried within a few minutes."));
      setAmount("");
      setReason("");
      setRequestId(newRequestId());
      await load(false);
    } catch (error) {
      toast.error((error instanceof Error && error.message) || t("admin.esim.cardCredit.failed", "The card's credit could not be changed"));
      // A refused change used its key: the next try is a new one.
      setRequestId(newRequestId());
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("admin.esim.cardCredit.title", "Card credit · {number}", { number: title })}</DialogTitle>
          <DialogDescription>
            {t("admin.esim.cardCredit.hint", "Added from the TopConnect dealer account, or taken back to it. The card never goes below zero.")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div>
            <div className="text-xs text-muted-foreground">{t("admin.esim.numberBalance", "Card balance")}</div>
            <div className="text-2xl font-semibold tabular-nums">
              {view && view.balanceMinor !== null ? amountText(view.balanceMinor, view.currency) : "—"}
            </div>
            {view?.blocked ? <div className="text-xs text-destructive">{t("admin.esim.numberBlocked", "Blocked")}</div> : null}
            {view?.checkedAt ? (
              <div className="text-xs text-muted-foreground">
                {t("admin.esim.cardCredit.checked", "Read {time}", { time: new Date(view.checkedAt).toLocaleString() })}
              </div>
            ) : null}
          </div>
          <Button size="sm" variant="outline" disabled={loading || saving} onClick={() => void load(true)}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-1.5">{t("admin.esim.cardCredit.refresh", "Read again")}</span>
          </Button>
        </div>

        {canManage ? (
          <div className="grid gap-3">
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={direction === "add" ? "default" : "outline"} onClick={() => setDirection("add")}>
                <Plus className="mr-1.5 h-4 w-4" />
                {t("admin.esim.cardCredit.add", "Add credit")}
              </Button>
              <Button type="button" size="sm" variant={direction === "deduct" ? "destructive" : "outline"} onClick={() => setDirection("deduct")}>
                <Minus className="mr-1.5 h-4 w-4" />
                {t("admin.esim.cardCredit.deduct", "Deduct credit")}
              </Button>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="card-credit-amount">{t("admin.esim.cardCredit.amount", "Amount ({currency})", { currency: view?.currency ?? "" })}</Label>
              <Input id="card-credit-amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="card-credit-reason">{t("admin.esim.cardCredit.reason", "Reason")}</Label>
              <Textarea id="card-credit-reason" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
              <p className="text-xs text-muted-foreground">{t("admin.esim.cardCredit.reasonHint", "Kept with the change and in the audit log.")}</p>
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="text-sm font-medium">{t("admin.esim.cardCredit.history", "Recent changes")}</div>
          {view?.adjustments.length ? (
            <div className="max-h-48 divide-y overflow-y-auto rounded-md border text-sm">
              {view.adjustments.map((row) => (
                <div key={row.id} className="flex items-start justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate">{row.reason}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString()}
                      {row.admin ? ` · ${row.admin}` : ""}
                      {row.message ? ` · ${row.message}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`font-medium tabular-nums ${row.direction === "add" ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                      {row.direction === "add" ? "+" : "−"}
                      {amountText(row.amountMinor, row.currency)}
                    </div>
                    <Badge variant={row.state === "completed" ? "secondary" : row.state === "failed" || row.state === "manual" ? "destructive" : "outline"}>
                      {stateLabel(row.state)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("admin.esim.cardCredit.none", "No changes by admins yet.")}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("admin.esim.cardCredit.close", "Close")}
          </Button>
          {canManage ? (
            <Button variant={direction === "deduct" ? "destructive" : "default"} disabled={saving || loading || !view} onClick={() => void submit()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {direction === "add" ? t("admin.esim.cardCredit.add", "Add credit") : t("admin.esim.cardCredit.deduct", "Deduct credit")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
