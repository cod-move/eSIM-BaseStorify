import afMessages from "@/locales/esim/af.json";
import arMessages from "@/locales/esim/ar.json";
import bnMessages from "@/locales/esim/bn.json";
import deMessages from "@/locales/esim/de.json";
import enMessages from "@/locales/esim/en.json";
import esMessages from "@/locales/esim/es.json";
import frMessages from "@/locales/esim/fr.json";
import haMessages from "@/locales/esim/ha.json";
import hiMessages from "@/locales/esim/hi.json";
import igMessages from "@/locales/esim/ig.json";
import jaMessages from "@/locales/esim/ja.json";
import nlMessages from "@/locales/esim/nl.json";
import swMessages from "@/locales/esim/sw.json";
import trMessages from "@/locales/esim/tr.json";
import xhMessages from "@/locales/esim/xh.json";
import yoMessages from "@/locales/esim/yo.json";
import zhMessages from "@/locales/esim/zh.json";
import zuMessages from "@/locales/esim/zu.json";
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
  af: afMessages as Messages,
  ar: arMessages as Messages,
  bn: bnMessages as Messages,
  de: deMessages as Messages,
  en: enMessages as Messages,
  es: esMessages as Messages,
  fr: frMessages as Messages,
  ha: haMessages as Messages,
  hi: hiMessages as Messages,
  ig: igMessages as Messages,
  ja: jaMessages as Messages,
  nl: nlMessages as Messages,
  sw: swMessages as Messages,
  tr: trMessages as Messages,
  xh: xhMessages as Messages,
  yo: yoMessages as Messages,
  zh: zhMessages as Messages,
  zu: zuMessages as Messages,
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
