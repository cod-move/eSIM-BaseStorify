"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Pencil, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast-notification";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";

/** Interactive bits of the "My eSIMs" pages (USR-03/04/06); the pages themselves render on the server. */

async function readError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { message?: string; error?: string };
    return body.message || body.error || fallback;
  } catch {
    return fallback;
  }
}

export function RefreshUsageButton({ esimId }: { esimId: string }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      const response = await fetch(`/api/esim/me/esims/${esimId}/refresh`, { method: "POST" });
      if (!response.ok) {
        toast.error(await readError(response, t("esim.account.refreshFailed", "Could not update usage")));
        return;
      }
      const { data } = (await response.json()) as { data: { refreshed: boolean; error?: string } };
      if (data.refreshed) toast.success(t("esim.account.refreshed", "Usage updated"));
      else toast.info(data.error ?? t("esim.account.notRefreshed", "Showing the last known usage"));
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={refresh} disabled={busy || pending}>
      <RefreshCw className={`me-2 h-4 w-4 ${busy || pending ? "animate-spin" : ""}`} />
      {t("esim.account.refresh", "Refresh usage")}
    </Button>
  );
}

export function RemarkEditor({ esimId, remark }: { esimId: string; remark: string | null }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(remark ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch(`/api/esim/me/esims/${esimId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remark: value }),
      });
      if (!response.ok) {
        toast.error(await readError(response, t("esim.account.remarkFailed", "Could not save the name")));
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <Pencil className="h-3.5 w-3.5" />
        {remark || t("esim.account.addRemark", "Add a name, e.g. \"Japan trip\"")}
      </button>
    );
  }
  return (
    <div className="flex max-w-sm items-center gap-2">
      <Input
        value={value}
        maxLength={100}
        autoFocus
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void save();
          if (event.key === "Escape") setEditing(false);
        }}
        aria-label={t("esim.account.remark", "Name")}
      />
      <Button size="sm" onClick={save} disabled={saving}>
        {t("common.save", "Save")}
      </Button>
    </div>
  );
}

export function CopyValue({ value, label }: { value: string; label: string }) {
  const t = useFallbackTranslator(useTranslations());
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="break-all font-mono text-sm">{value}</div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={t("esim.account.copy", "Copy")}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        <span className="sr-only">{copied ? t("esim.account.copied", "Copied") : t("esim.account.copy", "Copy")}</span>
      </Button>
    </div>
  );
}

/** Cancel and refund (USR-07): only offered when the page found the eSIM cancellable. */
export function CancelEsimButton({ esimId, refund, fee, toBalance }: { esimId: string; refund: string; fee: string; toBalance: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const { confirm } = useConfirmation();
  const [busy, setBusy] = useState(false);

  async function cancel() {
    const ok = await confirm({
      title: t("esim.cancel.confirmTitle", "Cancel this eSIM?"),
      description: toBalance
        ? t("esim.cancel.confirmBalance", "It stops working at once and cannot be installed. {refund} goes back to your balance ({fee} fee kept).", { refund, fee })
        : t("esim.cancel.confirmOriginal", "It stops working at once and cannot be installed. {refund} is refunded to your payment ({fee} fee kept).", { refund, fee }),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/esim/me/esims/${esimId}/cancel`, { method: "POST" });
      if (!response.ok) {
        const reason = await readError(response, "");
        toast.error(reason === "supplier" ? t("esim.cancel.supplierRefused", "The network did not accept the cancellation. Please contact us.") : t("esim.cancel.failed", "This eSIM can no longer be cancelled."));
        return;
      }
      toast.success(t("esim.cancel.done", "Cancelled. Your refund is on its way."));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={cancel} disabled={busy}>
      {t("esim.cancel.button", "Cancel and refund")}
    </Button>
  );
}
