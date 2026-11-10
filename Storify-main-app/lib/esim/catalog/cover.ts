import { emojiFlagCode, flagSrc } from "@/lib/esim/storefront/flags";

/**
 * The picture an eSIM product gets when nobody gave it one (CAT-05): drawn
 * on request by app/api/esim/product-image/[version]/[file]/route.tsx from
 * the destination's flags, name and the store's colour. Pure.
 *
 * The path carries a version: the image optimizer keeps a picture for a year
 * under its URL, so a new look gets a new path (bump COVER_VERSION) and
 * products are moved onto it by the next publish.
 */

export const COVER_VERSION = "v1";
const COVER_PATH = /^\/api\/esim\/product-image\/(v\d+)\/([a-z0-9-]+)\.png$/;

/** "/api/esim/product-image/v1/japan-esim.png" */
export function coverPath(productSlug: string): string {
  return `/api/esim/product-image/${COVER_VERSION}/${productSlug}.png`;
}

/** Whether a product's picture is one of these covers (any version). */
export function isGeneratedCover(url: string | null | undefined): boolean {
  return Boolean(url && COVER_PATH.test(url.replace(/^https?:\/\/[^/]+/i, "")));
}

/**
 * The images a product should have after a publish, or null to leave them:
 * none yet (and no media) → the cover; an older cover → this version's;
 * anything an admin put there → left alone.
 */
export function coverImages(productSlug: string, product: { images?: string[] | null; media?: unknown[] | null }): string[] | null {
  const images = product.images ?? [];
  if (!images.length) return (product.media ?? []).length ? null : [coverPath(productSlug)];
  if (images.length === 1 && isGeneratedCover(images[0]) && images[0] !== coverPath(productSlug)) return [coverPath(productSlug)];
  return null;
}

export interface CoverPlan {
  destination: string;
  emoji: string | null;
  coverage: { scope: "local" | "regional" | "global"; countries: Array<{ code: string; name?: string }> };
}

export interface CoverFacts {
  name: string;
  scope: "local" | "regional" | "global";
  /** Flag files to draw, at most four ("/esim/flags/JP.svg"). */
  flags: string[];
  countryCount: number;
}

/** What a destination's cover shows, from its plans (the name most of them use). */
export function coverFacts(plans: CoverPlan[], fallbackName: string): CoverFacts {
  const names = new Map<string, number>();
  const scopes = new Map<CoverPlan["coverage"]["scope"], number>();
  const countries = new Map<string, number>();
  let emoji: string | null = null;
  for (const plan of plans) {
    if (plan.destination) names.set(plan.destination, (names.get(plan.destination) ?? 0) + 1);
    scopes.set(plan.coverage.scope, (scopes.get(plan.coverage.scope) ?? 0) + 1);
    for (const country of plan.coverage.countries) {
      const code = country.code.toUpperCase();
      countries.set(code, (countries.get(code) ?? 0) + 1);
    }
    emoji ??= plan.emoji;
  }
  const most = <T,>(counts: Map<T, number>) => [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  const scope = most(scopes) ?? "local";
  const codes = [...countries].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([code]) => code);
  const regionFlag = flagSrc(emojiFlagCode(emoji));
  const flags =
    scope === "local"
      ? [flagSrc(codes[0]) ?? regionFlag].filter((src): src is string => Boolean(src))
      : regionFlag
        ? [regionFlag]
        : codes.map(flagSrc).filter((src): src is string => Boolean(src)).slice(0, 4);
  return { name: most(names) ?? fallbackName, scope, flags, countryCount: countries.size };
}

/** "japan-esim" → "Japan": the name when no plan says one. */
export function nameFromSlug(productSlug: string): string {
  return productSlug
    .replace(/-esim$/, "")
    .split("-")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

/** A font size that keeps a name on one or two lines of the cover. */
export function nameFontSize(name: string): number {
  const length = name.length;
  if (length <= 10) return 104;
  if (length <= 16) return 84;
  if (length <= 24) return 68;
  return 54;
}
