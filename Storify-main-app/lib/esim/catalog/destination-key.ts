import { slugify } from "@/lib/esim/providers/json";

/**
 * Which destination a plan is sold under (its `productSlug`). Pure.
 *
 * Suppliers name the same place differently ("China", "China mainland";
 * "Hong Kong", "Hong Kong (China)"), and the catalogue groups plans by that
 * name, so one country could become two destinations. So:
 *
 * 1. A plan for a single country is filed under that country, by its ISO
 *    code: `china-esim`, named "China", whatever the supplier called it.
 * 2. Then the merges an admin made apply (Admin → eSIM → Destinations →
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
  const countrySlug = only ? countryProductSlug(only) : null;
  const base = countrySlug ?? supplierSlug;
  return {
    productSlug: mergedSlug(base, merges),
    destination: countrySlug && only ? (countryName(only) ?? plan.destination) : plan.destination,
  };
}
