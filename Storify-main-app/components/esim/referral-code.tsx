"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast-notification";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";

/** The shopper's invite link, to copy, and their code, to change (REF-01/05). */
export function ReferralCode({ code, link }: { code: string; link: string }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(code);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/esim/me/referral", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: value }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        toast.error(body.message || t("esim.referral.codeFailed", "Could not change the code"));
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input readOnly value={link} className="font-mono text-sm" aria-label={t("esim.referral.link", "Your invite link")} />
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
          {copied ? t("esim.referral.copied", "Copied") : t("esim.referral.copy", "Copy link")}
        </Button>
      </div>
      {editing ? (
        <div className="flex max-w-sm items-center gap-2">
          <Input value={value} maxLength={16} autoFocus onChange={(event) => setValue(event.target.value.toUpperCase())} aria-label={t("esim.referral.code", "Your code")} />
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("common.save", "Save")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setValue(code); }}>
            {t("common.cancel", "Cancel")}
          </Button>
        </div>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Pencil className="h-3.5 w-3.5" />
          {t("esim.referral.codeIs", "Your code: {code} — change it", { code })}
        </button>
      )}
    </div>
  );
}
