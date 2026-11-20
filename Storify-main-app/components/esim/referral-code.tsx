"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast-notification";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";

type Landing = "home" | "destinations" | "country" | "numbers";

/**
 * The shopper's invite link, to copy, and their code, to change (REF-01/05).
 * The link may open any page (`?ref=`, patch P80): the shopper picks the home
 * page (the default), the destinations, one country, or the number eSIMs.
 */
export function ReferralCode({
  code,
  base,
  countries,
}: {
  code: string;
  base: string;
  countries: Array<{ name: string; path: string }>;
}) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [landing, setLanding] = useState<Landing>("home");
  const [country, setCountry] = useState(countries[0]?.path ?? "");
  const path =
    landing === "destinations" ? "/esim" : landing === "numbers" ? "/esim/numbers" : landing === "country" && country ? country : "/";
  const link = `${base.replace(/\/+$/, "")}${path}?ref=${encodeURIComponent(code)}`;
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
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="referral-landing" className="text-muted-foreground">
          {t("esim.referral.landing", "Link opens")}
        </label>
        <select
          id="referral-landing"
          value={landing}
          onChange={(event) => setLanding(event.target.value as Landing)}
          className="h-9 rounded-md border bg-background px-2"
        >
          <option value="home">{t("esim.referral.landingHome", "Home page")}</option>
          <option value="destinations">{t("esim.referral.landingDestinations", "eSIM destinations")}</option>
          {countries.length ? <option value="country">{t("esim.referral.landingCountry", "A country")}</option> : null}
          <option value="numbers">{t("esim.referral.landingNumbers", "Number eSIMs")}</option>
        </select>
        {landing === "country" ? (
          <select
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            aria-label={t("esim.referral.landingCountry", "A country")}
            className="h-9 max-w-[14rem] rounded-md border bg-background px-2"
          >
            {countries.map((entry) => (
              <option key={entry.path} value={entry.path}>
                {entry.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Input readOnly value={link} className="font-mono text-sm" aria-label={t("esim.referral.link", "Your invite link")} />
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            const intro = t("esim.referral.shareText", "Join me and we both get free data, plus more free data every day you check in:");
            await navigator.clipboard.writeText(`${intro}\n${link}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="me-2 h-4 w-4" /> : <Copy className="me-2 h-4 w-4" />}
          {copied ? t("esim.referral.copied", "Copied") : t("esim.referral.copy", "Copy link")}
        </Button>
      </div>
      {editing ? (
        <div className="flex max-w-sm items-center gap-2">
          <Input value={value} maxLength={16} autoFocus onChange={(event) => setValue(event.target.value.toUpperCase())} aria-label={t("esim.referral.code", "Your code")} />
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
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
