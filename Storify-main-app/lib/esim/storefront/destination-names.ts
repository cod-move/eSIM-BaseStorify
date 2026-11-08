import "server-only";

import { unstable_cache } from "next/cache";
import { connectDB } from "@/lib/db";
import { EsimDestination } from "@/models/esim-destination.model";
import { getDestination, multiDestinations, STOREFRONT_TAG, withRegionalPlans } from "@/lib/esim/storefront/catalog";
import { destinationsIn, type DestinationNames, type NamedDestination } from "@/lib/esim/storefront/destination-name";

/** The names admins gave destinations, by URL slug and language; cached with the catalogue. */
async function readNames(): Promise<DestinationNames> {
  await connectDB();
  const rows = await EsimDestination.find({ names: { $exists: true } }).select({ productSlug: 1, names: 1 }).lean();
  const names: DestinationNames = {};
  for (const row of rows) {
    const entries = Object.entries((row.names ?? {}) as unknown as Record<string, string>).filter(([, value]) => typeof value === "string" && value.trim());
    if (entries.length) names[row.productSlug.replace(/-esim$/, "")] = Object.fromEntries(entries);
  }
  return names;
}

export const destinationNames = unstable_cache(readNames, ["esim-destination-names"], { revalidate: 300, tags: [STOREFRONT_TAG] });

/** The destinations named in `locale` (lib/esim/storefront/destination-name.ts). Never throws. */
export async function localizeDestinations<T extends NamedDestination>(list: readonly T[], locale: string): Promise<Array<T & { englishName: string }>> {
  let names: DestinationNames = {};
  try {
    names = await destinationNames();
  } catch (error) {
    console.error("Reading the destination names failed:", error);
  }
  return destinationsIn(list, locale, names);
}

/** One destination named in `locale`. */
export async function localizeDestination<T extends NamedDestination>(destination: T, locale: string): Promise<T & { englishName: string }> {
  return (await localizeDestinations([destination], locale))[0];
}

/** A destination page's destination, named in `locale`; null when there is none. */
export async function getLocalizedDestination(slug: string, scope: "local" | "multi", locale: string) {
  const destination = await getDestination(slug, scope);
  if (!destination) return null;
  // A country's page also offers the regions' plans that cover it, named in `locale` too.
  const page = scope === "local" ? withRegionalPlans(destination, await localizeDestinations(await multiDestinations(), locale)) : destination;
  return localizeDestination(page, locale);
}
