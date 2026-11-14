"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast-notification";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import { formatAmount } from "@/lib/esim/numbers/line";
import { parseReplacementCard } from "@/lib/esim/numbers/import";

export interface AdminQrRequest {
  id: string;
  numberId: string;
  msisdn: string;
  customer: { id: string; email: string | null; name: string | null } | null;
  feeMinor: number;
  currency: string;
  state: string;
  createdAt: string;
  lastError: string | null;
}

/**
 * New-QR-code requests on Admin → eSIM → Numbers. TopConnect has no command
 * for a new profile: a person orders it from TopConnect, moves the number to
 * the new card there, then pastes the card's line here — ICCID LPA PIN1 PUK1
 * PIN2 PUK2, split by spaces — and the number moves to that ICCID with its
 * codes; or declines (the fee goes back on the number).
 */
export function EsimNumberQrRequests({ requests, canManage }: { requests: AdminQrRequest[]; canManage: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [card, setCard] = useState("");
  const { confirm } = useConfirmation();
  const parsed = card.trim() ? parseReplacementCard(card) : null;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function answer(request: AdminQrRequest, action: "complete" | "reject") {
    const id = request.id;
    if (action === "complete") {
      if (!parsed?.ok) return;
      const ok = await confirm({
        type: "warning",
        title: t("admin.esim.qrConfirmTitle", "Move +{number} to ICCID {iccid}?", { number: request.msisdn, iccid: parsed.card.iccid }),
        description: t(
          "admin.esim.qrConfirmText",
          "The number takes the new ICCID, activation code and PIN/PUK codes, and the customer sees the new QR code. The old eSIM stops working once TopConnect has moved the number.",
        ),
        confirmText: t("admin.esim.qrSave", "Move the number to the new card"),
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await apiClient.post(`/api/esim/admin/number-requests/${id}`, action === "complete" ? { action, card, note: note || undefined } : { action, note });
      toast.success(t("admin.esim.saved", "Saved"));
      setOpen(null);
      setCard("");
      setNote("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.esim.qrRequests", "New QR code requests")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(
            "admin.esim.qrRequestsHint",
            "Order the new eSIM profile from TopConnect and move the number to it there, then paste the new card's line: ICCID LPA PIN1 PUK1 PIN2 PUK2, split by spaces. The number moves to that ICCID with its codes. Declining puts the fee back on the number.",
          )}
        </p>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.esim.qrRequestsNone", "No open requests.")}</p>
        ) : (
          <ul className="divide-y">
            {requests.map((request) => (
              <li key={request.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">+{request.msisdn}</span>
                  <Badge variant={request.state === "pending" ? "default" : "outline"}>{request.state}</Badge>
                  <span className="text-muted-foreground">{request.customer?.email ?? "—"}</span>
                  <span className="text-muted-foreground">{formatAmount(request.feeMinor, request.currency)}</span>
                  <span className="text-muted-foreground">{new Date(request.createdAt).toLocaleString()}</span>
                  {canManage && (request.state === "pending" || request.state === "manual") ? (
                    <Button size="sm" variant="outline" className="ms-auto" onClick={() => setOpen(open === request.id ? null : request.id)}>
                      {t("admin.esim.qrAnswer", "Answer")}
                    </Button>
                  ) : null}
                </div>
                {request.lastError ? <p className="text-xs text-destructive">{request.lastError}</p> : null}
                {open === request.id ? (
                  <div className="space-y-2 rounded-lg border p-3">
                    <Textarea
                      rows={2}
                      className="font-mono text-xs"
                      placeholder="8937204017170000000 LPA:1$smdp.example.com$ACTIVATIONCODE 1234 12345678 5678 87654321"
                      value={card}
                      onChange={(event) => setCard(event.target.value)}
                    />
                    {parsed ? <CardPreview parsed={parsed} /> : null}
                    <Input placeholder={t("admin.esim.qrNote", "Note for the customer (needed to decline)")} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" disabled={busy || !parsed?.ok} onClick={() => void answer(request, "complete")}>
                        {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                        {t("admin.esim.qrSave", "Move the number to the new card")}
                      </Button>
                      {request.state === "pending" ? (
                        <Button size="sm" variant="outline" disabled={busy || !note.trim()} onClick={() => void answer(request, "reject")}>
                          {t("admin.esim.qrDecline", "Decline and refund")}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** What the pasted line was read as, so a field in the wrong place shows before saving. */
function CardPreview({ parsed }: { parsed: ReturnType<typeof parseReplacementCard> }) {
  const t = useFallbackTranslator(useTranslations());
  if (!parsed.ok) {
    const problems = {
      fields: t("admin.esim.qrCardFields", "Paste one line: ICCID LPA PIN1 PUK1 PIN2 PUK2, split by spaces"),
      iccid: t("admin.esim.qrCardIccid", "The first field must be the new ICCID (18–22 digits)"),
      lpa: t("admin.esim.qrCardLpa", "The second field must be the full activation code: LPA:1$address$code"),
      pin: t("admin.esim.qrCardPin", "PIN and PUK codes must be 4–10 digits"),
    };
    return <p className="text-xs text-destructive">{problems[parsed.reason]}</p>;
  }
  const rows: Array<[string, string | null]> = [
    ["ICCID", parsed.card.iccid],
    ["LPA", parsed.card.lpa],
    ["PIN1", parsed.card.pin1],
    ["PUK1", parsed.card.puk1],
    ["PIN2", parsed.card.pin2],
    ["PUK2", parsed.card.puk2],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-md bg-muted/50 p-2 text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="break-all font-mono">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
