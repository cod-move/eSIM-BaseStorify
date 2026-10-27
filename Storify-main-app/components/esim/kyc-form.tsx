"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast-notification";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import type { KycField } from "@/lib/esim/kyc/rules";

/**
 * The identity verification form (KYC-02), drawn from the published fields.
 * Sent as multipart form data; the server checks every answer again and
 * says, field by field, what needs another look.
 */
export function KycForm({ fields }: { fields: KycField[] }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const response = await fetch("/api/esim/me/kyc", { method: "POST", body: new FormData(event.currentTarget) });
      const body = (await response.json().catch(() => ({}))) as { message?: string; errors?: Record<string, string[]> };
      if (!response.ok) {
        const fieldErrors = Object.fromEntries(Object.entries(body.errors ?? {}).filter(([key]) => key !== "_error").map(([key, messages]) => [key, messages[0] ?? ""]));
        setErrors(fieldErrors);
        toast.error(Object.keys(fieldErrors).length ? t("esim.kyc.fixErrors", "Some answers need another look") : body.message || t("esim.kyc.failed", "Could not send your details"));
        return;
      }
      toast.success(t("esim.kyc.sent", "Sent. We will tell you when it has been checked."));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {fields.map((field) => {
        const id = `kyc-${field.key}`;
        return (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={id}>
              {field.label}
              {field.required ? <span className="text-destructive"> *</span> : null}
            </Label>
            {field.type === "textarea" ? (
              <Textarea id={id} name={field.key} required={field.required} maxLength={2000} />
            ) : field.type === "select" ? (
              <NativeSelect id={id} name={field.key} required={field.required} defaultValue="">
                <option value="" disabled>{t("esim.kyc.choose", "Choose…")}</option>
                {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
              </NativeSelect>
            ) : field.type === "file" ? (
              <Input id={id} name={field.key} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required={field.required} />
            ) : (
              <Input id={id} name={field.key} type={field.type === "date" ? "date" : "text"} required={field.required} maxLength={300} />
            )}
            {field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
            {errors[field.key] ? <p className="text-xs text-destructive">{errors[field.key]}</p> : null}
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">{t("esim.kyc.privacy", "Your documents are stored privately and seen only by our staff checking them.")}</p>
      <Button type="submit" disabled={busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {t("esim.kyc.submit", "Send for review")}
      </Button>
    </form>
  );
}
