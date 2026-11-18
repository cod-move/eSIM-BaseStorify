import "server-only";

import { EsimProductLink } from "@/models/esim-product-link.model";
import { repricePlans } from "@/lib/esim/pricing/reprice";
import { publishProducts } from "@/lib/esim/catalog/publish";

export interface SyncedCostsResult {
  /** Plans re-priced because the supplier's cost moved. */
  repriced: number;
  /** Destinations whose store product was updated with the new prices. */
  republished: string[];
}

/**
 * After a catalogue sync: plans whose supplier cost moved get a new price
 * at once, and destinations already in the store get it on their product,
 * so a supplier's price rise never sells at the old margin until someone
 * re-publishes by hand.
 *
 * Only destinations that already have a product are re-published (a sync
 * never creates one), and re-publishing keeps each product's status, name
 * and pictures (lib/esim/catalog/publish.ts). Plans priced by hand are left
 * alone, as by every re-pricing.
 */
export async function applySyncedCosts(providerCode: string): Promise<SyncedCostsResult> {
  const repriced = await repricePlans({ providerCode, onlyIfCostChanged: true });
  if (!repriced.changedSlugs.length) return { repriced: repriced.changed, republished: [] };

  const linked: string[] = await EsimProductLink.distinct("productSlug", {
    productSlug: { $in: repriced.changedSlugs },
  });
  if (!linked.length) return { repriced: repriced.changed, republished: [] };

  const published = await publishProducts({ productSlugs: linked });
  return { repriced: repriced.changed, republished: [...published.updated, ...published.drafted] };
}
