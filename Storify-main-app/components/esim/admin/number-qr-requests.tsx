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
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import { formatAmount } from "@/lib/esim/numbers/line";

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
 * for a new profile: a person orders it from TopConnect, then pastes the new
 * activation code here (it replaces the number's), or declines (the fee goes
 * back on the number).
 */
export function EsimNumberQrRequests({ requests, canManage }: { requests: AdminQrRequest[]; canManage: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [lpa, setLpa] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function answer(id: string, action: "complete" | "reject") {
    setBusy(true);
    try {
      await apiClient.post(`/api/esim/admin/number-requests/${id}`, action === "complete" ? { action, lpa, note: note || undefined } : { action, note });
      toast.success(t("admin.esim.saved", "Saved"));
      setOpen(null);
      setLpa("");
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
            "Order the new eSIM profile from TopConnect, then paste its full activation code (LPA:1$…). It replaces the number's code. Declining puts the fee back on the number.",
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
                    <Textarea rows={2} placeholder="LPA:1$smdp.example.com$ACTIVATIONCODE" value={lpa} onChange={(event) => setLpa(event.target.value)} />
                    <Input placeholder={t("admin.esim.qrNote", "Note for the customer (needed to decline)")} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" disabled={busy || !lpa.trim()} onClick={() => void answer(request.id, "complete")}>
                        {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                        {t("admin.esim.qrSave", "Save the new code")}
                      </Button>
                      {request.state === "pending" ? (
                        <Button size="sm" variant="outline" disabled={busy || !note.trim()} onClick={() => void answer(request.id, "reject")}>
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
