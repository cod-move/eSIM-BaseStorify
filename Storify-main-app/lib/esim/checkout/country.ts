import { COUNTRIES } from "@/lib/intl/country-options";
import { ValidationError } from "@/lib/api/errors";
import { countryCodeForValue, countryNameForCode } from "@/lib/intl/country-availability";

/** The storefront's languages: a shopper may type the country in any of them. */
const LOCALES = ["en", "zh", "zh-Hant", "ja", "ar", "bn", "de", "es", "fr", "hi", "nl", "tr", "af", "ha", "ig", "sw", "xh", "yo", "zu"];

const key = (value: string) => value.trim().toLocaleLowerCase().replace(/[\s.'’,()-]+/g, "");

let byName: Map<string, string> | null = null;

/** Every country's name in every storefront language, to its ISO code. */
function localizedNames(): Map<string, string> {
  if (byName) return byName;
  byName = new Map();
  for (const locale of LOCALES) {
    let names: Intl.DisplayNames;
    try {
      names = new Intl.DisplayNames([locale], { type: "region", fallback: "none" });
    } catch {
      continue;
    }
    for (const { value } of COUNTRIES) {
      const code = value.toUpperCase();
      const name = names.of(code);
      if (name && !byName.has(key(name))) byName.set(key(name), code);
    }
  }
  return byName;
}

/**
 * The country as the store's list writes it. The website picks it from a list;
 * the app has the shopper type it, often in their own language ("中国",
 * "Deutschland"), which the store's check only knows by English name or ISO
 * code. A value the store already knows is kept as it is; a name it knows in
 * another language becomes the store's English name; anything else is left for
 * the check to refuse.
 */
export function canonicalCountry(value: string): string {
  if (!value.trim() || countryCodeForValue(value)) return value;
  const code = localizedNames().get(key(value));
  return (code && countryNameForCode(code)) || value;
}

const UNAVAILABLE: Record<string, string> = {
  zh: "该国家/地区暂不支持配送，请换一个国家或地区",
  "zh-hant": "該國家/地區暫不支援配送，請換一個國家或地區",
  en: "We don't deliver to this country or region",
};

/**
 * The app's address routes: the store refuses a country it does not serve
 * under "address.country" (the website's form names it so), which the app's
 * form cannot place, so the shopper saw nothing. Here it is "country", in the
 * shopper's language.
 */
export async function withAppCountryError<T>(locale: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const errors = (error as { name?: string; errors?: Record<string, string[]> }).errors;
    if (error instanceof ValidationError && errors?.["address.country"]) {
      const { "address.country": _country, ...rest } = errors;
      throw new ValidationError({ ...rest, country: [UNAVAILABLE[locale.toLowerCase()] ?? UNAVAILABLE.en!] });
    }
    throw error;
  }
}
