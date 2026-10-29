import type { StorefrontVariant } from "@/lib/esim/storefront/selector";

/**
 * A destination's plans side by side (WEB-14) and the countries a regional or
 * global plan covers with their operators (WEB-15). Pure.
 */

export interface ComparisonRow {
  variant: StorefrontVariant;
  /** The price shown: a day-priced plan's price for its fewest days. */
  priceMinor: number;
  /** Price for one GB, for plans with a fixed data total; null otherwise. */
  perGbMinor: number | null;
  /** Price for one day; null when the days are not fixed. */
  perDayMinor: number | null;
  /** The cheapest per GB among the rows that have one. */
  bestPerGb: boolean;
}

/** Shortest first, then least data, then cheapest. */
export function comparisonRows(variants: StorefrontVariant[]): ComparisonRow[] {
  const rows = variants.map((variant): ComparisonRow => {
    const days = variant.perDay ? variant.perDay.minDays : variant.days;
    const priceMinor = variant.perDay ? variant.perDay.priceMinor * variant.perDay.minDays : variant.priceMinor;
    const perGbMinor = (variant.dataType === "total" || variant.dataType === "lifetime") && variant.megabytes > 0
      ? Math.round((priceMinor * 1024) / variant.megabytes)
      : null;
    const perDayMinor = variant.perDay ? variant.perDay.priceMinor : days ? Math.round(priceMinor / days) : null;
    return { variant, priceMinor, perGbMinor, perDayMinor, bestPerGb: false };
  });
  const priced = rows.filter((row) => row.perGbMinor !== null);
  if (priced.length > 1) {
    const best = Math.min(...priced.map((row) => row.perGbMinor!));
    for (const row of priced) row.bestPerGb = row.perGbMinor === best;
  }
  const daysOf = (row: ComparisonRow) => row.variant.perDay?.minDays ?? row.variant.days ?? 0;
  const dataOf = (row: ComparisonRow) => (row.perGbMinor !== null ? row.variant.megabytes : Number.MAX_SAFE_INTEGER);
  return rows.sort(
    (a, b) => daysOf(a) - daysOf(b) || dataOf(a) - dataOf(b) || a.priceMinor - b.priceMinor || a.variant.name.localeCompare(b.variant.name),
  );
}

export interface CoveredCountry {
  code: string;
  name: string;
  operators: Array<{ operator: string; network: string | null }>;
}

const GENERATIONS = ["5G", "4G", "LTE", "3G", "2G"];
const rank = (network: string | null) => {
  if (!network) return GENERATIONS.length;
  const index = GENERATIONS.findIndex((generation) => network.toUpperCase().includes(generation));
  return index === -1 ? GENERATIONS.length : index;
};

/** Each covered country with its operators, fastest network first; countries by name. */
export function coverageByCountry(
  countries: Array<{ code: string; name: string }>,
  networks: Array<{ countryCode: string; operator: string; network: string | null }>,
  locale?: string,
): CoveredCountry[] {
  const byCountry = new Map<string, Map<string, string | null>>();
  for (const network of networks) {
    const code = network.countryCode.toUpperCase();
    const operators = byCountry.get(code) ?? new Map<string, string | null>();
    const seen = operators.get(network.operator);
    // The same operator seen on several generations keeps the fastest.
    if (seen === undefined || rank(network.network) < rank(seen)) operators.set(network.operator, network.network);
    byCountry.set(code, operators);
  }
  return countries
    .map((country) => ({
      code: country.code,
      name: country.name,
      operators: [...(byCountry.get(country.code.toUpperCase()) ?? new Map<string, string | null>()).entries()]
        .map(([operator, network]) => ({ operator, network }))
        .sort((a, b) => rank(a.network) - rank(b.network) || a.operator.localeCompare(b.operator)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

/** Countries whose name or code holds the search, ignoring case and accents. */
export function searchCountries(countries: CoveredCountry[], search: string): CoveredCountry[] {
  const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const query = fold(search.trim());
  if (!query) return countries;
  return countries.filter(
    (country) =>
      fold(country.name).includes(query) ||
      country.code.toLowerCase() === query ||
      country.operators.some((entry) => fold(entry.operator).includes(query)),
  );
}

/** The event that tells the plan selector which plan the comparison table chose (WEB-14). */
export const PLAN_CHOOSE_EVENT = "esim:choose-plan";
