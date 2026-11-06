import "server-only";

import { destinationPath, listDestinations } from "@/lib/esim/storefront/catalog";
import { resolveDestinationAlias } from "@/lib/esim/catalog/merge";

/**
 * Where an address that shows no destination should go instead (WEB-31/32):
 * the same destination under its other address (a country page asked for a
 * region, or the other way round), or the destination it was merged into
 * (`/esim/china-mainland` → `/esim/china`, lib/esim/catalog/merge.ts).
 * Null when there is none: the page is a 404.
 */
export async function destinationRedirect(slug: string): Promise<string | null> {
  const listed = await listDestinations();
  const same = listed.find((destination) => destination.slug === slug);
  if (same) return destinationPath(same);
  const target = await resolveDestinationAlias(`${slug}-esim`);
  if (!target) return null;
  const moved = listed.find((destination) => destination.slug === target.replace(/-esim$/, ""));
  return moved ? destinationPath(moved) : null;
}
