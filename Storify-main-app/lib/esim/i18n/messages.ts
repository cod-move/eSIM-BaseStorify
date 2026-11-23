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
import zhHantMessages from "@/locales/esim/zh-hant.json";
import zuMessages from "@/locales/esim/zu.json";
import afStore from "@/locales/esim/store/af.json";
import deStore from "@/locales/esim/store/de.json";
import esStore from "@/locales/esim/store/es.json";
import frStore from "@/locales/esim/store/fr.json";
import haStore from "@/locales/esim/store/ha.json";
import hiStore from "@/locales/esim/store/hi.json";
import igStore from "@/locales/esim/store/ig.json";
import nlStore from "@/locales/esim/store/nl.json";
import swStore from "@/locales/esim/store/sw.json";
import trStore from "@/locales/esim/store/tr.json";
import xhStore from "@/locales/esim/store/xh.json";
import yoStore from "@/locales/esim/store/yo.json";
import zuStore from "@/locales/esim/store/zu.json";
import arStore from "@/locales/esim/store/ar.json";
import bnStore from "@/locales/esim/store/bn.json";
import jaStore from "@/locales/esim/store/ja.json";
import zhStore from "@/locales/esim/store/zh.json";
import zhHantStore from "@/locales/esim/store/zh-hant.json";
import { isRecord } from "@/lib/utils";

/**
 * The eSIM module's messages (patch P9, `lib/i18n/request.ts`), kept in
 * `locales/esim/<locale>.json` so Storify's own locale files stay untouched.
 *
 * Layered as Storify layers its own: English under every locale, the
 * locale's eSIM file over it, and Storify's messages over both — a key both
 * define keeps Storify's wording, so the module can never change an official
 * label. Built once per locale.
 *
 * One exception: `locales/esim/store/<locale>.json` translates Storify's own
 * strings that its locale file leaves missing or in English (the checkout's,
 * where the page otherwise shows English in every language). Those go over
 * Storify's messages; only such strings belong there, never one Storify
 * translates.
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
  "zh-hant": zhHantMessages as Messages,
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

/** Storify's own strings it leaves untranslated, for the store's languages (see above). */
const STORE: Record<string, Messages> = {
  af: afStore as Messages,
  ar: arStore as Messages,
  bn: bnStore as Messages,
  de: deStore as Messages,
  es: esStore as Messages,
  fr: frStore as Messages,
  ha: haStore as Messages,
  hi: hiStore as Messages,
  ig: igStore as Messages,
  ja: jaStore as Messages,
  nl: nlStore as Messages,
  sw: swStore as Messages,
  tr: trStore as Messages,
  xh: xhStore as Messages,
  yo: yoStore as Messages,
  "zh-hant": zhHantStore as Messages,
  zh: zhStore as Messages,
  zu: zuStore as Messages,
};

const merged = new Map<string, Messages>();

export function withEsimMessages(locale: string, official: Messages): Messages {
  let result = merged.get(locale);
  if (!result) {
    const esim = locale === "en" || !ESIM[locale] ? ESIM.en : mergeDeep(ESIM.en, ESIM[locale]);
    result = mergeDeep(esim, official);
    if (STORE[locale]) result = mergeDeep(result, STORE[locale]);
    merged.set(locale, result);
  }
  return result;
}
