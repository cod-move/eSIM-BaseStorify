"use client";

import { useCallback, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import {
  CUSTOMER_EMAIL_MESSAGE_MAX,
  CUSTOMER_EMAIL_SUBJECT_MAX,
} from "@/lib/esim/admin/customer-email-body";
import type { CustomerEmailRow } from "@/lib/esim/admin/customer-email";

const newRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const STATUS_LABEL: Record<string, string> = {
  sent: "Sent",
  queued: "Queued",
  sending: "Sending",
  retrying: "Retrying",
  failed: "Failed",
  cancelled: "Cancelled",
  unconfigured: "Email not set up",
};

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "sent") return "default";
  if (status === "failed" || status === "unconfigured" || status === "cancelled") return "destructive";
  return "secondary";
}

/**
 * "Send email" on the admin customer page (patch P69): a subject and a
 * message in plain text, sent to the customer's own address
 * (POST /api/esim/admin/customers/[id]/emails), and the emails written to
 * them before, with whether each was delivered.
 */
export function CustomerEmailButton({ customerId, email }: { customerId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [requestId, setRequestId] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<CustomerEmailRow[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/esim/admin/customers/${customerId}/emails`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.message || "");
      setHistory(data.data.emails as CustomerEmailRow[]);
    } catch {
      setHistory([]);
    }
  }, [customerId]);

  const openDialog = () => {
    setSubject("");
    setMessage("");
    setRequestId(newRequestId());
    setHistory(null);
    setExpanded(null);
    setOpen(true);
    void loadHistory();
  };

  const submit = async () => {
    if (!subject.trim()) {
      toast.error("Write a subject");
      return;
    }
    if (!message.trim()) {
      toast.error("Write a message");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/esim/admin/customers/${customerId}/emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), message, requestId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.message || data?.error || "");
      const row = data.data.email as CustomerEmailRow;
      if (row.status === "failed" || row.status === "unconfigured") {
        toast.error(`Not sent: ${row.error || STATUS_LABEL[row.status]}`);
      } else {
        toast.success(row.status === "sent" ? `Email sent to ${row.to}` : `Email queued for ${row.to}`);
      }
      // A new id: the next email is a new one, even with the same words.
      setRequestId(newRequestId());
      setSubject("");
      setMessage("");
      void loadHistory();
    } catch (error) {
      toast.error((error instanceof Error && error.message) || "Could not send the email");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={openDialog}>
        <Mail className="mr-1.5 h-4 w-4" />
        Send email
      </Button>
      <Dialog open={open} onOpenChange={(next) => !sending && setOpen(next)}>
        <DialogContent className="grid-cols-1 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Email this customer</DialogTitle>
            <DialogDescription>
              Sent to {email} from the store&apos;s email address. Write plain text: a blank line starts a new
              paragraph and web addresses become links.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="customer-email-subject">Subject</Label>
              <Input
                id="customer-email-subject"
                value={subject}
                maxLength={CUSTOMER_EMAIL_SUBJECT_MAX}
                onChange={(event) => setSubject(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="customer-email-message">Message</Label>
              <Textarea
                id="customer-email-message"
                rows={9}
                value={message}
                maxLength={CUSTOMER_EMAIL_MESSAGE_MAX}
                onChange={(event) => setMessage(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">Kept on this page and in the audit log.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
              Close
            </Button>
            <Button onClick={() => void submit()} disabled={sending}>
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
              Send
            </Button>
          </DialogFooter>

          <div className="border-t pt-4">
            <p className="mb-2 text-sm font-medium">Sent earlier</p>
            {history === null ? (
              <p className="text-sm text-muted-foreground">
                <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
                Loading…
              </p>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No emails written to this customer yet.</p>
            ) : (
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {history.map((row) => (
                  <li key={row.id} className="rounded-md border p-2 text-sm">
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-2 text-left"
                      onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{row.subject}</span>
                        <span className="block text-xs text-muted-foreground">
                          {new Date(row.createdAt).toLocaleString()}
                          {row.sentByEmail ? ` · ${row.sentByEmail}` : ""}
                          {row.to !== email ? ` · to ${row.to}` : ""}
                        </span>
                      </span>
                      <Badge variant={statusVariant(row.status)} className="shrink-0">
                        {STATUS_LABEL[row.status] ?? row.status}
                      </Badge>
                    </button>
                    {expanded === row.id ? (
                      <div className="mt-2 space-y-1 border-t pt-2">
                        <p className="whitespace-pre-wrap break-words">{row.message}</p>
                        {row.error && row.status !== "sent" ? (
                          <p className="text-xs text-destructive">{row.error}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
