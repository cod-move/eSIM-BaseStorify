import { slugify } from "@/lib/esim/providers/json";
import { CONTINENT_LABELS, continentOf, type Continent } from "@/lib/esim/storefront/continents";

/**
 * Which destination a plan is sold under (its `productSlug`). Pure.
 *
 * Suppliers name the same place differently ("China", "China mainland";
 * "Hong Kong", "Hong Kong (China)"), and the catalogue groups plans by that
 * name, so one country could become two destinations. So:
 *
 * 1. A plan for a single country is filed under that country, by its ISO
 *    code: `china-esim`, named "China", whatever the supplier called it.
 * 2. A plan for several countries is filed by the countries it covers, not
 *    by its name (see `coverageProductSlug`).
 * 3. Then the merges an admin made apply (Admin → eSIM → Destinations →
 *    a destination → Merge into): "greater-china-esim" → "china-esim".
 *
 * The supplier's own slug is kept on the plan (`supplierProductSlug`), so
 * undoing a merge files the plans back where they came from.
 */

/** English names where the standard one is not what shoppers search for. */
const COUNTRY_NAMES: Record<string, string> = {
  BQ: "Bonaire",
  CD: "DR Congo",
  CG: "Congo",
  CI: "Ivory Coast",
  CZ: "Czech Republic",
  FM: "Micronesia",
  HK: "Hong Kong",
  KP: "North Korea",
  KR: "South Korea",
  MM: "Myanmar",
  MO: "Macao",
  PS: "Palestine",
  TR: "Turkey",
  TW: "Taiwan",
  VA: "Vatican City",
  VC: "Saint Vincent and the Grenadines",
  XK: "Kosovo",
};

let displayNames: Intl.DisplayNames | null | undefined;

/** A country's English name, by ISO code; `null` for a code that is not one. */
export function countryName(code: string): string | null {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return null;
  if (COUNTRY_NAMES[upper]) return COUNTRY_NAMES[upper];
  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      displayNames = null;
    }
  }
  const name = displayNames?.of(upper);
  // A code no country has comes back as itself or as "Unknown Region".
  if (!name || name === upper || /^unknown\b/i.test(name)) return null;
  return name.replace(/\bSt\. /g, "Saint ").replace(/ & /g, " and ");
}

/** The destination a single country is sold under: "CN" → "china-esim". */
export function countryProductSlug(code: string): string | null {
  const name = countryName(code);
  const slug = name ? slugify(name) : "";
  return slug ? `${slug}-esim` : null;
}

/** Follows an admin's merges from a slug to where it ends; stops at a loop. */
export function mergedSlug(slug: string, merges: ReadonlyMap<string, string>): string {
  let current = slug;
  const seen = new Set([current]);
  for (let next = merges.get(current); next && !seen.has(next); next = merges.get(current)) {
    current = next;
    seen.add(current);
  }
  return current;
}

/** Fewer countries than this are filed as the set itself, never as a region. */
export const REGION_MIN_COUNTRIES = 4;
/** Share of a plan's countries that must lie in one standard region. */
export const REGION_SHARE = 0.8;

/**
 * Where a plan for several countries is sold, from the countries alone:
 * - global plans: "global-120-esim", "Global (120 countries)";
 * - 4+ countries, at least 80% in one standard region (the continents of the
 *   destination overview): "europe-33-esim", "Europe (33 countries)". A
 *   different number of countries is a different destination;
 * - 2–3 countries: the set itself, "china-hong-kong-macao-esim",
 *   "China + Hong Kong + Macao", so suppliers' different names still meet;
 * - anything else: `null` (the supplier's own slug is kept).
 */
export function coverageProductSlug(scope: string, codes: ReadonlyArray<string>): { productSlug: string; destination: string } | null {
  const set = [...new Set(codes.map((code) => code.trim().toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code)))].sort();
  if (set.length < 2) return null;
  if (scope === "global") return { productSlug: `global-${set.length}-esim`, destination: `Global (${set.length} countries)` };
  if (set.length < REGION_MIN_COUNTRIES) {
    const names = set.map((code) => countryName(code));
    if (names.some((name) => !name)) return null;
    const sorted = (names as string[]).sort((a, b) => a.localeCompare(b, "en"));
    return { productSlug: `${slugify(sorted.join(" "))}-esim`, destination: sorted.join(" + ") };
  }
  const counts = new Map<Continent, number>();
  for (const code of set) {
    const continent = continentOf(code);
    if (continent !== "other") counts.set(continent, (counts.get(continent) ?? 0) + 1);
  }
  const [best, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!best || !count || count / set.length < REGION_SHARE) return null;
  return { productSlug: `${slugify(CONTINENT_LABELS[best])}-${set.length}-esim`, destination: `${CONTINENT_LABELS[best]} (${set.length} countries)` };
}

export interface KeyedPlan {
  productSlug: string;
  destination: string;
  coverage: { scope: string; countries: ReadonlyArray<{ code: string }> };
}

/**
 * The destination a plan is filed under, and its name. `supplierProductSlug`
 * is what the supplier's data said (the plan's own `productSlug` when the plan
 * comes straight from a sync).
 */
export function destinationKey(
  plan: KeyedPlan & { supplierProductSlug?: string | null },
  merges: ReadonlyMap<string, string> = new Map(),
): { productSlug: string; destination: string } {
  const supplierSlug = plan.supplierProductSlug || plan.productSlug;
  const only = plan.coverage.scope === "local" && plan.coverage.countries.length === 1 ? plan.coverage.countries[0].code : null;
  if (only) {
    const countrySlug = countryProductSlug(only);
    if (countrySlug) return { productSlug: mergedSlug(countrySlug, merges), destination: countryName(only) ?? plan.destination };
  }
  // An admin's merge of the supplier's own slug still wins.
  if (merges.has(supplierSlug)) return { productSlug: mergedSlug(supplierSlug, merges), destination: plan.destination };
  const covered = plan.coverage.scope === "local" ? null : coverageProductSlug(plan.coverage.scope, plan.coverage.countries.map((country) => country.code));
  if (covered) return { productSlug: mergedSlug(covered.productSlug, merges), destination: covered.destination };
  return { productSlug: mergedSlug(supplierSlug, merges), destination: plan.destination };
}
