"use client";

import { useState } from "react";
import { Loader2, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast-notification";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { deductionProblem, parseMinor, toMinor } from "@/lib/esim/wallet/deduct-policy";

const newRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * "Deduct" beside Storify's "Give credit" on the admin customer page's Store
 * credit tab (patch P62): an amount and a reason, confirmed, then taken off
 * the balance (POST /api/esim/admin/customers/[id]/store-credit-deduction).
 * `balance` is the customer's balance in `currency`, as the tab shows it.
 */
export function StoreCreditDeductButton({
  customerId,
  currency,
  balance,
  format,
  onDone,
}: {
  customerId: string;
  currency: string;
  balance: number;
  format: (amount: number, currency: string) => string;
  onDone: () => void;
}) {
  const { confirm } = useConfirmation();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [requestId, setRequestId] = useState("");
  const [saving, setSaving] = useState(false);
  const balanceMinor = toMinor(balance);

  const openDialog = () => {
    setAmount("");
    setReason("");
    setRequestId(newRequestId());
    setOpen(true);
  };

  const submit = async () => {
    const amountMinor = parseMinor(amount);
    if (amountMinor === null) {
      toast.error("Enter an amount, like 12.50");
      return;
    }
    const problem = deductionProblem(amountMinor, balanceMinor);
    if (problem) {
      toast.error(problem);
      return;
    }
    if (!reason.trim()) {
      toast.error("Say why the balance is deducted");
      return;
    }
    const ok = await confirm({
      type: "danger",
      title: `Deduct ${format(amountMinor / 100, currency)}?`,
      description: `The customer's balance goes from ${format(balanceMinor / 100, currency)} to ${format((balanceMinor - amountMinor) / 100, currency)}. This cannot be undone here; give credit to put it back.`,
      confirmText: "Deduct",
      confirmVariant: "destructive",
    });
    if (!ok) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/esim/admin/customers/${customerId}/store-credit-deduction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountMinor, currency, reason: reason.trim(), requestId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.message || data?.error || "");
      toast.success(data.data?.created === false ? "Already deducted" : "Balance deducted");
      setOpen(false);
      onDone();
    } catch (error) {
      toast.error((error instanceof Error && error.message) || "Could not deduct the balance");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={openDialog} disabled={balanceMinor <= 0}>
        <Minus className="mr-1.5 h-4 w-4" />
        Deduct
      </Button>
      <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}>
        <DialogContent className="grid-cols-1">
          <DialogHeader>
            <DialogTitle>Deduct store credit</DialogTitle>
            <DialogDescription>
              Takes money off the customer&apos;s balance, from the part that expires first. Balance now:{" "}
              {format(balance, currency)}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="store-credit-deduct-amount">Amount ({currency})</Label>
              <Input
                id="store-credit-deduct-amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="store-credit-deduct-reason">Reason</Label>
              <Textarea
                id="store-credit-deduct-reason"
                value={reason}
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Credit given by mistake"
              />
              <p className="text-xs text-muted-foreground">Kept in the history and the audit log.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void submit()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Deduct
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
