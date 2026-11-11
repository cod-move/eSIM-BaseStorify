/**
 * A destination's name in the page's language (WEB-01). Pure, so the browser
 * and the tests can use it.
 *
 * The catalogue names a destination as the supplier does, in English
 * ("China", "China mainland", "Europe 35 areas"). Shown in another
 * language:
 * - the name an admin gave for that language (Admin → eSIM → Destinations →
 *   a destination → Names), when there is one;
 * - otherwise, for a single country named plainly after itself ("China",
 *   "Japan"), the country's name in that language ("中国", "日本");
 * - otherwise the supplier's name.
 */

export interface NamedDestination {
  slug: string;
  name: string;
  scope: string;
  countries: ReadonlyArray<{ code: string; name: string }>;
}

/** Names an admin gave, by URL slug and then by language. */
export type DestinationNames = Record<string, Record<string, string>>;

/**
 * A name reduced to compare it: no accents, case or punctuation, "&" read as
 * "and", "St." as "Saint", without a leading "The" — so "Curacao" is
 * "Curaçao" and "Antigua and Barbuda" is "Antigua & Barbuda".
 */
export function plainName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/st.?(?=s)/g, "saint")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "");
}

/**
 * The other names a country goes by at suppliers, besides its own (in
 * Intl's English) — each still just that country, so it is translated.
 */
const ALSO_KNOWN_AS: Record<string, readonly string[]> = {
  AE: ["UAE", "United Arab Emirates"],
  BA: ["Bosnia", "Bosnia and Herzegovina"],
  BN: ["Brunei Darussalam"],
  BO: ["Bolivia, Plurinational State of"],
  CD: ["DR Congo", "Democratic Republic of the Congo", "Congo, Democratic Republic", "Congo (DRC)", "Congo Kinshasa"],
  CG: ["Republic of the Congo", "Congo Brazzaville", "Congo"],
  CI: ["Ivory Coast", "Cote d'Ivoire"],
  CV: ["Cape Verde", "Cabo Verde"],
  CW: ["Curacao"],
  CZ: ["Czech Republic", "Czechia"],
  FM: ["Micronesia", "Federated States of Micronesia"],
  GB: ["UK", "United Kingdom", "Great Britain", "England"],
  HK: ["Hong Kong", "Hong Kong SAR", "Hong Kong China"],
  IR: ["Iran, Islamic Republic of"],
  KR: ["South Korea", "Korea", "Korea, Republic of", "Republic of Korea"],
  LA: ["Laos", "Lao PDR", "Lao People's Democratic Republic"],
  MD: ["Moldova, Republic of"],
  MK: ["Macedonia", "North Macedonia"],
  MM: ["Burma", "Myanmar"],
  MO: ["Macau", "Macao", "Macao SAR", "Macau SAR", "Macau China", "Macao China"],
  PS: ["Palestine", "State of Palestine", "Palestinian Territory", "Palestine, State of"],
  RE: ["Reunion"],
  RU: ["Russia", "Russian Federation"],
  SX: ["Sint Maarten", "Sint Maarten (Dutch part)"],
  MF: ["Saint Martin", "Saint Martin (French part)"],
  SY: ["Syria", "Syrian Arab Republic"],
  SZ: ["Swaziland", "Eswatini"],
  TL: ["East Timor", "Timor-Leste"],
  TR: ["Turkey", "Turkiye", "Türkiye"],
  TW: ["Taiwan", "Taiwan, Province of China", "Taiwan China"],
  TZ: ["Tanzania", "Tanzania, United Republic of"],
  US: ["USA", "United States", "United States of America"],
  VA: ["Vatican", "Vatican City", "Holy See"],
  VE: ["Venezuela, Bolivarian Republic of"],
  VG: ["British Virgin Islands", "Virgin Islands, British"],
  VI: ["US Virgin Islands", "U.S. Virgin Islands", "Virgin Islands, U.S."],
  VN: ["Vietnam", "Viet Nam"],
};

/** Whether `name` is just the country `code`'s name, in one of its English forms. */
export function namesCountry(name: string, code: string, supplierName = ""): boolean {
  const wanted = plainName(name);
  if (!wanted) return false;
  let english = "";
  try {
    english = new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? "";
  } catch {
    english = "";
  }
  return [supplierName, english, ...(ALSO_KNOWN_AS[code] ?? [])].some((known) => known && plainName(known) === wanted);
}

export function destinationNameIn(destination: NamedDestination, locale: string, names: DestinationNames = {}): string {
  const given = names[destination.slug]?.[locale]?.trim();
  if (given) return given;
  if (locale === "en" || locale.startsWith("en-")) return destination.name;
  const country = destination.scope === "local" && destination.countries.length === 1 ? destination.countries[0] : null;
  if (!country || !/^[A-Z]{2}$/.test(country.code)) return destination.name;
  // Only a name that is just the country's: "China mainland" or "Japan 5G" stay as they are.
  if (!namesCountry(destination.name, country.code, country.name)) return destination.name;
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(country.code) ?? destination.name;
  } catch {
    return destination.name;
  }
}

/** The destinations with their names in `locale`; the English name stays as `englishName`, for search. */
export function destinationsIn<T extends NamedDestination>(list: readonly T[], locale: string, names: DestinationNames = {}): Array<T & { englishName: string }> {
  return list.map((destination) => ({ ...destination, name: destinationNameIn(destination, locale, names), englishName: destination.name }));
}
