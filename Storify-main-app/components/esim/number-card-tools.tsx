"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRightLeft, Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast-notification";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import { formatAmount } from "@/lib/esim/numbers/line";
import { parseCardAmount } from "@/lib/esim/numbers/op-policy";

/**
 * Beside "Add credit" on a number's page, as the live store has them: send
 * a text message to the number (to check it receives), and move credit to
 * another of the shopper's numbers.
 */

const SMS_MAX = 160;
const DEFAULT_SENDER = "37259500001";

export function SendSmsButton({ numberId, title }: { numberId: string; title: string }) {
  const t = useFallbackTranslator(useTranslations());
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(DEFAULT_SENDER);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const length = [...message.trim()].length;

  async function send() {
    setBusy(true);
    try {
      await apiClient.post(`/api/esim/me/numbers/${numberId}/sms`, { from, message });
      toast.success(t("esim.number.smsSent", "Message sent to {number}", { number: title }));
      setOpen(false);
      setMessage("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <MessageSquare className="me-1 h-4 w-4" /> {t("esim.number.smsToSelf", "Send SMS to myself")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("esim.number.smsToSelf", "Send SMS to myself")}</DialogTitle>
            <DialogDescription>{t("esim.number.smsHint", "A text message to {number}, to check that it receives messages.", { number: title })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sms-from">{t("esim.number.smsFrom", "Sender number")}</Label>
              <Input id="sms-from" inputMode="numeric" value={from} onChange={(event) => setFrom(event.target.value.replace(/[^\d+]/g, "").slice(0, 16))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sms-message">{t("esim.number.smsMessage", "Message")}</Label>
              <Textarea id="sms-message" rows={4} maxLength={SMS_MAX} value={message} onChange={(event) => setMessage(event.target.value)} />
              <p className="text-end text-xs text-muted-foreground tabular-nums">
                {length} / {SMS_MAX}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full" disabled={busy || !length || length > SMS_MAX || !/^\+?\d{3,15}$/.test(from)} onClick={send}>
              {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              {t("esim.number.smsSend", "Send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function TransferCreditButton({
  numberId,
  title,
  balanceMinor,
  currency,
  targets,
}: {
  numberId: string;
  title: string;
  balanceMinor: number | null;
  currency: string;
  targets: Array<{ id: string; title: string }>;
}) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(targets[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  if (!targets.length) return null;
  const amountMinor = parseCardAmount(amount);
  const tooMuch = amountMinor !== null && balanceMinor !== null && amountMinor > balanceMinor;

  async function send() {
    if (!amountMinor) return;
    setBusy(true);
    try {
      const result = await apiClient.post<{ state: string; message: string | null }>(`/api/esim/me/numbers/${numberId}/transfer`, { to, amountMinor, key });
      if (result?.state === "completed") toast.success(t("esim.number.transferDone", "Credit moved"));
      else toast.info(t("esim.number.transferPending", "The transfer is being made and shows within a few minutes"));
      setOpen(false);
      setAmount("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      // A refused transfer is settled: the next try is a new one.
      setKey(crypto.randomUUID());
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setKey(crypto.randomUUID());
          setOpen(true);
        }}
      >
        <ArrowRightLeft className="me-1 h-4 w-4" /> {t("esim.number.transfer", "Transfer credit")}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("esim.number.transfer", "Transfer credit")}</DialogTitle>
            <DialogDescription>
              {t("esim.number.transferHint", "Moves credit from {number} to another of your numbers.", { number: title })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("esim.number.transferTo", "To number")}</Label>
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger aria-label={t("esim.number.transferTo", "To number")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transfer-amount">
                {t("esim.number.transferAmount", "Amount ({currency})", { currency: currency.toUpperCase() })}
              </Label>
              <Input id="transfer-amount" inputMode="decimal" value={amount} placeholder="0.00" onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, "").slice(0, 8))} />
              <p className={tooMuch ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                {balanceMinor !== null ? t("esim.number.transferAvailable", "Available: {amount}", { amount: formatAmount(balanceMinor, currency) }) : null}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full" disabled={busy || !to || !amountMinor || tooMuch} onClick={send}>
              {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              {amountMinor ? t("esim.number.transferSend", "Transfer {amount}", { amount: formatAmount(amountMinor, currency) }) : t("esim.number.transfer", "Transfer credit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
