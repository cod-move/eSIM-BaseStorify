"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast-notification";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";

/**
 * A destination's name in each store language (WEB-01). Left empty, a
 * language shows the automatic name: the country's own name for a plain
 * single-country destination, a region's put together in the language
 * (lib/esim/storefront/region-name.ts), the supplier's English otherwise.
 */

export interface DestinationNamesView {
  supplierName: string;
  languages: Array<{ locale: string; automatic: string; given: string; english?: boolean }>;
}

export function EsimDestinationNamesCard({ productSlug, names, canManage }: { productSlug: string; names: DestinationNamesView; canManage: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(names.languages.map((entry) => [entry.locale, entry.given])));
  const [busy, setBusy] = useState(false);
  const languageName = (locale: string) => {
    try {
      return new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale;
    } catch {
      return locale;
    }
  };

  async function save() {
    setBusy(true);
    try {
      await apiClient.post("/api/esim/admin/destinations/names", { productSlug, names: draft });
      toast.success(t("admin.esim.namesSaved", "Names saved"));
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
        <CardTitle className="text-base">{t("admin.esim.destinationNames", "Name in each language")}</CardTitle>
        <CardDescription>
          {t(
            "admin.esim.destinationNamesHint",
            "The supplier calls it \"{name}\". Leave a language empty to show the automatic name in grey: a single country's own name, or a region's put together in that language (\"Europe (35 countries)\", \"China + Hong Kong\"). A name that cannot be put together keeps the supplier's English and is marked below.",
            { name: names.supplierName },
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {names.languages.map((entry) => (
            <div key={entry.locale} className="space-y-1">
              <Label htmlFor={`destination-name-${entry.locale}`} className="text-xs">
                {languageName(entry.locale)} <span className="text-muted-foreground">({entry.locale})</span>
              </Label>
              <Input
                id={`destination-name-${entry.locale}`}
                value={draft[entry.locale] ?? ""}
                placeholder={entry.automatic}
                maxLength={80}
                disabled={!canManage}
                onChange={(event) => setDraft({ ...draft, [entry.locale]: event.target.value })}
              />
              {entry.english && !(draft[entry.locale] ?? "").trim() ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {t("admin.esim.destinationNameEnglish", "Not translated: shows the supplier's English name")}
                </p>
              ) : null}
            </div>
          ))}
        </div>
        {canManage ? (
          <Button size="sm" disabled={busy} onClick={save}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("admin.esim.save", "Save")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
