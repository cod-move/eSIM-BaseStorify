"use client";

import { localeConfig, isValidLocale } from "@/config/i18n.config";
import { useAppSettings } from "@/providers/app-settings-provider";
import { cn } from "@/lib/utils";
import {
  hasPageContent,
  type ContentPageTranslations,
} from "@/lib/esim/content-pages/translations";

const nameOf = (code: string) =>
  isValidLocale(code) ? localeConfig[code].nativeName : code;

/**
 * The languages a policy page can be written in: the store's default (the
 * page's own title and content) and every other language the store serves.
 * `""` stands for the default version. A dot marks a language that has its
 * own version; one without shows the default version to its visitors.
 */
export function useContentPageLanguages(): { defaultCode: string; others: string[] } {
  const { defaultLanguage, supportedLanguages } = useAppSettings();
  const defaultCode = String(defaultLanguage || "").toLowerCase();
  const others = (supportedLanguages ?? [])
    .map((code) => String(code).toLowerCase())
    .filter((code, i, all) => code && code !== defaultCode && isValidLocale(code) && all.indexOf(code) === i);
  return { defaultCode, others };
}

export function ContentPageLanguagePicker({
  value,
  onChange,
  translations,
}: {
  value: string;
  onChange: (code: string) => void;
  translations: ContentPageTranslations;
}) {
  const { defaultCode, others } = useContentPageLanguages();
  if (others.length === 0) return null;

  const chip = (code: string, label: string, filled: boolean) => (
    <button
      key={code || "default"}
      type="button"
      onClick={() => onChange(code)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        value === code
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
      <span
        className={cn("h-1.5 w-1.5 rounded-full", filled ? "bg-emerald-500" : "bg-muted-foreground/30")}
        aria-hidden
      />
    </button>
  );

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Language</p>
      <div className="flex flex-wrap gap-2">
        {chip("", `${nameOf(defaultCode)} (default)`, true)}
        {others.map((code) => chip(code, nameOf(code), hasPageContent(translations[code]?.content)))}
      </div>
      <p className="text-xs text-muted-foreground">
        {value
          ? "Visitors using this language see this version. Leave the content empty to show the default version."
          : "Shown in every language that has no version of its own."}
      </p>
    </div>
  );
}
