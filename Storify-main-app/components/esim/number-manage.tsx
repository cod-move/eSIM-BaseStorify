"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Activity, AlertTriangle, FileText, Loader2, MapPin, QrCode, RefreshCw, RotateCcw, Ticket, Trash2, UserRoundPlus, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast-notification";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import { formatAmount } from "@/lib/esim/numbers/line";
import { formatSeconds, formatTraffic } from "@/lib/esim/numbers/service-policy";
import type { NumberDiagnostics } from "@/lib/esim/numbers/services";
import { cn } from "@/lib/utils";

/**
 * A number's "Diagnose" and "Manage" cards on its page. Diagnose: what the
 * network last saw (calls, texts, data, registrations), a check list for a
 * line that does not connect, and a reconnect. Manage: a new QR code (fee
 * off the number's credit, made by a person within about an hour), moving
 * the number to another account, and giving it up.
 */

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function NumberDiagnosticsCard({ numberId, testSms }: { numberId: string; testSms?: ReactNode }) {
  const t = useFallbackTranslator(useTranslations());
  const [result, setResult] = useState<NumberDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [connects, setConnects] = useState<"yes" | "no" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setResult(await apiClient.get<NumberDiagnostics>(`/api/esim/me/numbers/${numberId}/diagnostics`));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [numberId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reconnect() {
    setReconnecting(true);
    try {
      const answer = await apiClient.post<{ reconnectAfter: string }>(`/api/esim/me/numbers/${numberId}/reconnect`, {});
      setResult((current) => (current ? { ...current, reconnectAfter: answer.reconnectAfter } : current));
      toast.success(t("esim.diagnose.reconnected", "The SIM is restarting. Wait a few minutes, then check the signal."));
      setConfirming(false);
    } catch (error) {
      const message = errorMessage(error, t("esim.diagnose.reconnectFailed", "The number could not be reconnected"));
      toast.error(/cannot be reconnected/i.test(message) ? t("esim.diagnose.reconnectUnsupported", "This SIM cannot be reconnected remotely. Restart the phone, or turn airplane mode on and off, to make it register on the network again.") : message);
      if (/cannot be reconnected/i.test(message)) {
        setResult((current) => (current ? { ...current, reconnectSupported: false } : current));
        setConfirming(false);
      }
    } finally {
      setReconnecting(false);
    }
  }

  const when = (at: string | null) => (at ? new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" }) : "—");
  const label = (type: string) =>
    ({
      outbound_call: t("esim.diagnose.outboundCall", "Outgoing call"),
      inbound_call: t("esim.diagnose.inboundCall", "Incoming call"),
      data: t("esim.diagnose.data", "Data session"),
      sms_outbound: t("esim.diagnose.smsSent", "Text sent"),
      sms_inbound: t("esim.diagnose.smsReceived", "Text received"),
      sms_inbound_nonclassic: t("esim.diagnose.smsReceived", "Text received"),
      voicemail: t("esim.services.voicemail", "Voicemail"),
    })[type] ?? type.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
  const waitUntil = result?.reconnectAfter && new Date(result.reconnectAfter).getTime() > Date.now() ? result.reconnectAfter : null;
  const latestLocation = result?.locations?.[0] ?? null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle className="text-base">{t("esim.diagnose.title", "Diagnose")}</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading} aria-label={t("esim.services.refresh", "Refresh")}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 rounded-lg border p-3">
          <div className="text-sm font-medium">{t("esim.diagnose.question", "Can this line connect to a mobile network?")}</div>
          <p className="text-xs text-muted-foreground">{t("esim.diagnose.questionHint", "Look at the signal bars for this line. Wi-Fi does not count.")}</p>
          <div className="flex gap-2">
            <Button size="sm" variant={connects === "yes" ? "default" : "outline"} onClick={() => setConnects("yes")}>
              {t("esim.diagnose.yes", "Yes")}
            </Button>
            <Button size="sm" variant={connects === "no" ? "default" : "outline"} onClick={() => setConnects("no")}>
              {t("esim.diagnose.no", "No")}
            </Button>
          </div>
          {connects ? (
            <ol className="list-decimal space-y-1 ps-5 text-sm text-muted-foreground">
              {(connects === "no"
                ? [
                    t("esim.diagnose.noStep1", "Turn the line on in the phone's SIM settings."),
                    t("esim.diagnose.noStep2", "Turn on data roaming for this line."),
                    t("esim.diagnose.noStep3", "Choose the network by hand in the line's network settings."),
                    t("esim.diagnose.noStep4", "Restart the phone, or use Reconnect below and wait a few minutes."),
                  ]
                : [
                    t("esim.diagnose.yesStep1", "Choose this line for mobile data."),
                    t("esim.diagnose.yesStep2", "Check that mobile data is on under Services, and that the number has credit or a data package."),
                    t("esim.diagnose.yesStep3", "Turn airplane mode on and off, then open a web page."),
                  ]
              ).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          ) : null}
        </div>

        {loading && !result ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("esim.services.loading", "Asking the network…")}
          </div>
        ) : failed && !result ? (
          <p className="text-sm text-muted-foreground">{t("esim.services.unavailable", "The network did not answer. Try again in a moment.")}</p>
        ) : result ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border p-3 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <Wifi className="h-4 w-4 text-muted-foreground" />
                  {t("esim.diagnose.session", "Data session now")}
                </div>
                <div className="mt-1 text-muted-foreground">
                  {result.session === undefined
                    ? "—"
                    : result.session
                      ? t("esim.diagnose.sessionOpen", "Open since {time} ({network})", { time: when(result.session.startedAt), network: result.session.mccmnc ?? "—" })
                      : t("esim.diagnose.sessionNone", "No open data session")}
                </div>
              </div>
              <div className="rounded-lg border p-3 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  {t("esim.diagnose.location", "Last registration")}
                </div>
                <div className="mt-1 text-muted-foreground">
                  {latestLocation
                    ? `${when(latestLocation.at)} · MCC/MNC ${latestLocation.mcc ?? "—"}/${latestLocation.mnc ?? "—"}${latestLocation.vlr ? ` · VLR ${latestLocation.vlr}` : ""}`
                    : result.locations === null
                      ? "—"
                      : t("esim.diagnose.never", "No record yet")}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Activity className="h-4 w-4 text-muted-foreground" />
                {t("esim.diagnose.activity", "Latest activity")}
              </div>
              {result.activity === null ? (
                <p className="text-sm text-muted-foreground">{t("esim.history.unavailable", "The network did not answer for this list.")}</p>
              ) : result.activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("esim.diagnose.never", "No record yet")}</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {result.activity.map((entry) => (
                    <li key={entry.type} className="flex items-start justify-between gap-3 p-3 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium">{label(entry.type)}</div>
                        <div className="text-xs text-muted-foreground">
                          {[
                            entry.party ? `+${entry.party}` : null,
                            entry.seconds !== null ? formatSeconds(entry.seconds) : null,
                            entry.bytes !== null ? formatTraffic(entry.bytes) : null,
                            [entry.operator, entry.country].filter(Boolean).join(" · ") || null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                      <div className="shrink-0 text-end text-xs text-muted-foreground">
                        <div>{when(entry.at)}</div>
                        {entry.costMinor ? <div>{formatAmount(entry.costMinor, entry.currency ?? "EUR")}</div> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {testSms}
          {result?.reconnectSupported !== false ? (
            <Button variant="outline" size="sm" onClick={() => setConfirming(true)} disabled={Boolean(waitUntil)}>
              <RotateCcw className="me-2 h-4 w-4" />
              {t("esim.diagnose.reconnect", "Reconnect to the network")}
            </Button>
          ) : null}
        </div>
        {result?.reconnectSupported === false ? (
          <p className="text-xs text-muted-foreground">
            {t("esim.diagnose.reconnectUnsupported", "This SIM cannot be reconnected remotely. Restart the phone, or turn airplane mode on and off, to make it register on the network again.")}
          </p>
        ) : null}
        {waitUntil ? (
          <p className="text-xs text-muted-foreground">{t("esim.diagnose.reconnectWait", "Reconnected recently; you can do it again after {time}.", { time: when(waitUntil) })}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">{t("esim.diagnose.note", "Each card shows the latest record of its kind; times are in your own time zone.")}</p>
      </CardContent>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("esim.diagnose.reconnect", "Reconnect to the network")}</DialogTitle>
            <DialogDescription>
              {t("esim.diagnose.reconnectHint", "The SIM restarts and registers on the network again. The line drops for a few minutes. Use it when the line shows no signal.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button onClick={() => void reconnect()} disabled={reconnecting}>
              {reconnecting ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              {t("esim.diagnose.reconnectConfirm", "Reconnect")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export interface QrRequestView {
  enabled: boolean;
  feeMinor: number;
  currency: string;
  /** The latest request: its state and when. */
  latest: { state: string; createdAt: string; note: string | null } | null;
}

export function NumberManageCard({ numberId, msisdn, title, qr, blocked }: { numberId: string; msisdn: string; title: string; qr: QrRequestView; blocked: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [dialog, setDialog] = useState<"qr" | "owner" | "release" | null>(null);
  const [key, setKey] = useState(newKey);
  const [email, setEmail] = useState("");
  const [confirm, setConfirm] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const open = (next: "qr" | "owner" | "release") => {
    setKey(newKey());
    setEmail("");
    setConfirm("");
    setUnderstood(false);
    setDialog(next);
  };
  const openQr = qr.latest && ["queued", "charging", "pending", "refunding", "manual"].includes(qr.latest.state);

  async function submit() {
    if (!dialog) return;
    setBusy(true);
    try {
      if (dialog === "qr") {
        const answer = await apiClient.post<{ message: string | null }>(`/api/esim/me/numbers/${numberId}/qr`, { key });
        toast.success(answer.message ?? t("esim.manage.qrRequested", "Requested. The new QR code usually takes about an hour."));
        setDialog(null);
        router.refresh();
      } else if (dialog === "owner") {
        await apiClient.post(`/api/esim/me/numbers/${numberId}/owner`, { email, key });
        toast.success(t("esim.manage.ownerDone", "The number is now on the other account"));
        router.push("/account/esims");
      } else {
        await apiClient.post(`/api/esim/me/numbers/${numberId}/release`, { confirm, key });
        toast.success(t("esim.manage.releaseDone", "The number was removed from your account"));
        router.push("/account/esims");
      }
    } catch (error) {
      toast.error(errorMessage(error, t("esim.services.failed", "The change could not be made")));
    } finally {
      setBusy(false);
    }
  }

  const stateText = (state: string) =>
    ({
      queued: t("esim.manage.qrCharging", "Taking the fee…"),
      charging: t("esim.manage.qrCharging", "Taking the fee…"),
      pending: t("esim.manage.qrPending", "Being made; usually about an hour"),
      refunding: t("esim.manage.qrRefunding", "Declined; the fee is going back on the number"),
      manual: t("esim.manage.qrManual", "We are checking this request"),
      completed: t("esim.manage.qrCompleted", "Done: the QR code above is the new one"),
      rejected: t("esim.manage.qrRejected", "Declined; the fee went back on the number"),
      failed: t("esim.manage.qrFailed", "Not made: the fee could not be taken"),
    })[state] ?? state;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("esim.manage.title", "Manage")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {qr.enabled ? (
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <QrCode className="h-4 w-4 text-muted-foreground" />
              {t("esim.manage.qr", "New QR code")}
              <span className="ms-auto text-xs text-muted-foreground">{qr.feeMinor > 0 ? formatAmount(qr.feeMinor, qr.currency) : t("esim.manage.free", "Free")}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("esim.manage.qrHint", "For a QR code that is lost or will not scan. To move to another phone you do not need one: delete the eSIM on the old phone while on Wi-Fi, wait 10 minutes, then scan the same code.")}
            </p>
            {qr.latest ? (
              <p className={cn("text-xs", openQr ? "text-primary" : "text-muted-foreground")}>
                {stateText(qr.latest.state)}
                {qr.latest.note ? ` — ${qr.latest.note}` : ""}
              </p>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => open("qr")} disabled={blocked || Boolean(openQr)}>
              {t("esim.manage.qrRequest", "Request a new QR code")}
            </Button>
          </div>
        ) : null}

        <VoucherSection numberId={numberId} blocked={blocked} />
        <BillSection numberId={numberId} />

        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <UserRoundPlus className="h-4 w-4 text-muted-foreground" />
            {t("esim.manage.owner", "Move to another account")}
          </div>
          <p className="text-xs text-muted-foreground">{t("esim.manage.ownerHint", "The number, its credit and its packages move to the account with the email you enter. This cannot be undone.")}</p>
          <Button size="sm" variant="outline" onClick={() => open("owner")}>
            {t("esim.manage.ownerButton", "Move to another account")}
          </Button>
        </div>

        <div className="space-y-2 rounded-lg border border-destructive/40 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <Trash2 className="h-4 w-4" />
            {t("esim.manage.release", "Give up this number")}
          </div>
          <p className="text-xs text-muted-foreground">{t("esim.manage.releaseHint", "The number leaves your account for good, with any credit left on it. This cannot be undone.")}</p>
          <Button size="sm" variant="destructive" onClick={() => open("release")}>
            {t("esim.manage.releaseButton", "Give up this number")}
          </Button>
        </div>
      </CardContent>

      <Dialog open={dialog !== null} onOpenChange={(next) => !next && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === "qr" ? t("esim.manage.qrRequest", "Request a new QR code") : dialog === "owner" ? t("esim.manage.ownerButton", "Move to another account") : t("esim.manage.releaseButton", "Give up this number")}
            </DialogTitle>
            <DialogDescription>{title}</DialogDescription>
          </DialogHeader>
          {dialog === "qr" ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{t("esim.manage.qrWarning", "The current QR code stops working once the new one is made. Ask only if scanning the old one failed.")}</span>
              </div>
              {qr.feeMinor > 0 ? (
                <p className="text-muted-foreground">
                  {t("esim.manage.qrFee", "{fee} comes off this number's credit; it must keep more than nothing after it.", { fee: formatAmount(qr.feeMinor, qr.currency) })}
                </p>
              ) : null}
            </div>
          ) : dialog === "owner" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="number-owner-email">{t("esim.manage.ownerEmail", "Email of the other account")}</Label>
                <Input id="number-owner-email" type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={understood} onCheckedChange={(value) => setUnderstood(value === true)} />
                <span>{t("esim.manage.ownerUnderstood", "I understand the number leaves my account for good.")}</span>
              </label>
            </div>
          ) : dialog === "release" ? (
            <div className="space-y-1.5">
              <Label htmlFor="number-release-confirm">{t("esim.manage.releaseConfirm", "Type the number to confirm: {number}", { number: `+${msisdn}` })}</Label>
              <Input id="number-release-confirm" inputMode="tel" autoComplete="off" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              variant={dialog === "release" ? "destructive" : "default"}
              onClick={() => void submit()}
              disabled={
                busy ||
                (dialog === "owner" && (!understood || !/^\S+@\S+\.\S+$/.test(email.trim()))) ||
                (dialog === "release" && confirm.replace(/\D/g, "") !== msisdn)
              }
            >
              {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              {dialog === "qr" ? t("esim.manage.qrRequest", "Request a new QR code") : dialog === "owner" ? t("esim.manage.ownerSubmit", "Move the number") : t("esim.manage.releaseSubmit", "Give it up")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** A TopConnect recharge voucher (its PIN) put on the number. */
function VoucherSection({ numberId, blocked }: { numberId: string; blocked: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const digits = pin.replace(/[\s-]/g, "");

  async function redeem() {
    setBusy(true);
    try {
      await apiClient.post(`/api/esim/me/numbers/${numberId}/voucher`, { pin: digits });
      toast.success(t("esim.manage.voucherDone", "Voucher added to the number's credit"));
      setPin("");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error, t("esim.manage.voucherFailed", "The voucher could not be used")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Ticket className="h-4 w-4 text-muted-foreground" />
        {t("esim.manage.voucher", "Redeem a voucher")}
      </div>
      <p className="text-xs text-muted-foreground">{t("esim.manage.voucherHint", "Enter the PIN of a recharge voucher to add its value to this number's credit.")}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input inputMode="numeric" autoComplete="off" placeholder="1234 5678 9012 3456" value={pin} onChange={(event) => setPin(event.target.value)} disabled={blocked || busy} aria-label={t("esim.manage.voucherCode", "Voucher PIN")} />
        <Button onClick={() => void redeem()} disabled={blocked || busy || !/^\d{6,32}$/.test(digits)}>
          {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
          {t("esim.manage.voucherRedeem", "Redeem")}
        </Button>
      </div>
    </div>
  );
}

/** The last twelve completed months, newest first, as "YYYY-MM". */
function pastMonths(now = new Date()): string[] {
  const months: string[] = [];
  for (let back = 1; back <= 12; back += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    months.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

/** A phone bill (PDF) for whole past months, downloaded at once. */
function BillSection({ numberId }: { numberId: string }) {
  const t = useFallbackTranslator(useTranslations());
  const months = pastMonths();
  const [from, setFrom] = useState(months[0]);
  const [to, setTo] = useState(months[0]);
  const [busy, setBusy] = useState(false);
  const label = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

  async function download() {
    setBusy(true);
    try {
      const response = await fetch(`/api/esim/me/numbers/${numberId}/statement?from=${from}&to=${to}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || t("esim.manage.billFailed", "The bill could not be made"));
      }
      const blob = await response.blob();
      const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? "phone-bill.pdf";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(errorMessage(error, t("esim.manage.billFailed", "The bill could not be made")));
    } finally {
      setBusy(false);
    }
  }

  const select = (value: string, onChange: (next: string) => void, aria: string) => (
    <select className="h-9 rounded-md border bg-background px-2 text-sm" value={value} onChange={(event) => onChange(event.target.value)} aria-label={aria}>
      {[...months].reverse().map((month) => (
        <option key={month} value={month}>
          {label(month)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <FileText className="h-4 w-4 text-muted-foreground" />
        {t("esim.manage.bill", "Phone bill")}
      </div>
      <p className="text-xs text-muted-foreground">{t("esim.manage.billHint", "A PDF of the calls, texts, data and credit added in whole past months (up to 12), from the network's records.")}</p>
      <div className="flex flex-wrap items-center gap-2">
        {select(from, setFrom, t("esim.manage.billFrom", "From month"))}
        <span className="text-sm text-muted-foreground">–</span>
        {select(to, setTo, t("esim.manage.billTo", "Through month"))}
        <Button size="sm" onClick={() => void download()} disabled={busy || to < from}>
          {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
          {t("esim.manage.billDownload", "Download PDF")}
        </Button>
      </div>
    </div>
  );
}
