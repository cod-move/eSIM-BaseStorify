"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Languages } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MenuLabels } from "@/lib/esim/storefront/menu-labels";

/**
 * A menu item's label in the store's other languages (patch P36), under the
 * label field of the menu editor. Left empty, a language shows the item's
 * own label. The languages are the store's (Settings → General).
 */

let languagesRequest: Promise<{ defaultLanguage: string; languages: string[] }> | null = null;

function storeLanguages() {
  languagesRequest ??= fetch("/api/settings/public")
    .then((response) => response.json())
    .then((body) => {
      const data = (body?.data ?? {}) as { defaultLanguage?: string; supportedLanguages?: unknown };
      const defaultLanguage = typeof data.defaultLanguage === "string" ? data.defaultLanguage : "en";
      const supported = Array.isArray(data.supportedLanguages) ? data.supportedLanguages.filter((code): code is string => typeof code === "string") : [];
      return { defaultLanguage, languages: supported.filter((code) => code !== defaultLanguage) };
    })
    .catch(() => {
      languagesRequest = null;
      return { defaultLanguage: "en", languages: [] };
    });
  return languagesRequest;
}

function languageName(locale: string) {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale;
  } catch {
    return locale;
  }
}

export function EsimMenuItemLabels({ label, value, onChange }: { label: string; value: MenuLabels | undefined; onChange: (labels: MenuLabels) => void }) {
  const [languages, setLanguages] = useState<string[]>([]);
  const filled = Object.values(value ?? {}).filter((text) => text.trim()).length;
  const [open, setOpen] = useState(filled > 0);

  useEffect(() => {
    let live = true;
    void storeLanguages().then((result) => {
      if (live) setLanguages(result.languages);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!languages.length) return null;
  return (
    <div className="mt-2 rounded-md border">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-1.5">
          <Languages className="h-3.5 w-3.5" />
          Label in other languages{filled ? ` (${filled}/${languages.length})` : ""}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="grid gap-2 border-t p-3 sm:grid-cols-2">
          {languages.map((locale) => (
            <div key={locale} className="space-y-1">
              <Label htmlFor={`menu-label-${locale}`} className="text-xs font-normal text-muted-foreground">
                {languageName(locale)} ({locale})
              </Label>
              <Input
                id={`menu-label-${locale}`}
                className="h-8"
                maxLength={120}
                value={value?.[locale] ?? ""}
                placeholder={label}
                onChange={(event) => onChange({ ...(value ?? {}), [locale]: event.target.value })}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
