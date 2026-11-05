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

const plain = (value: string) => value.trim().toLowerCase();

export function destinationNameIn(destination: NamedDestination, locale: string, names: DestinationNames = {}): string {
  const given = names[destination.slug]?.[locale]?.trim();
  if (given) return given;
  if (locale === "en" || locale.startsWith("en-")) return destination.name;
  const country = destination.scope === "local" && destination.countries.length === 1 ? destination.countries[0] : null;
  if (!country || !/^[A-Z]{2}$/.test(country.code)) return destination.name;
  // Only a name that is just the country's: "China mainland" or "Japan 5G" stay as they are.
  let english: string | undefined;
  try {
    english = new Intl.DisplayNames(["en"], { type: "region" }).of(country.code);
  } catch {
    return destination.name;
  }
  if (plain(destination.name) !== plain(country.name) && plain(destination.name) !== plain(english ?? "")) return destination.name;
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
