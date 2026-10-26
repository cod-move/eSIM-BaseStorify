import enMessages from "@/locales/esim/en.json";
import zhMessages from "@/locales/esim/zh.json";
import { isRecord } from "@/lib/utils";

/**
 * The eSIM module's messages (patch P9, `lib/i18n/request.ts`), kept in
 * `locales/esim/<locale>.json` so Storify's own locale files stay untouched.
 *
 * Layered as Storify layers its own: English under every locale, the
 * locale's eSIM file over it, and Storify's messages over both — a key both
 * define keeps Storify's wording, so the module can never change an official
 * label. Built once per locale.
 */

type Messages = Record<string, unknown>;

const ESIM: Record<string, Messages> = {
  en: enMessages as Messages,
  zh: zhMessages as Messages,
};

function mergeDeep(base: Messages, override: Messages): Messages {
  const result: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    result[key] = isRecord(current) && isRecord(value) ? mergeDeep(current, value) : value;
  }
  return result;
}

const merged = new Map<string, Messages>();

export function withEsimMessages(locale: string, official: Messages): Messages {
  let result = merged.get(locale);
  if (!result) {
    const esim = locale === "en" || !ESIM[locale] ? ESIM.en : mergeDeep(ESIM.en, ESIM[locale]);
    result = mergeDeep(esim, official);
    merged.set(locale, result);
  }
  return result;
}
