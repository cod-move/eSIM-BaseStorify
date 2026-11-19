import "server-only";

import { mongoose } from "@/lib/db";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProfile } from "@/models/esim-profile.model";
import { coverageByCountry, type CoveredCountry } from "@/lib/esim/storefront/compare";
import { ownerFilter } from "@/lib/esim/account/esims";

/**
 * The countries a shopper's eSIM works in, each with its operators and their
 * fastest network (WEB-15, on the eSIM's own page). Countries named in the
 * page's language; empty for an eSIM whose plan is not in the catalogue here
 * (a migrated one) or when the shopper does not own it.
 */
export async function esimCoverage(userId: string, esimId: string, locale: string): Promise<CoveredCountry[]> {
  if (!mongoose.isValidObjectId(esimId)) return [];
  const profile = await EsimProfile.findOne({ _id: esimId, ...(await ownerFilter(userId)) }).select({ plan: 1 }).lean<{ plan: mongoose.Types.ObjectId | null }>();
  if (!profile?.plan) return [];
  const plan = await EsimPlan.findById(profile.plan)
    .select({ coverage: 1, supplierNetworks: 1 })
    .lean<{
      coverage: { countries: Array<{ code: string; name: string }>; networks: Array<{ countryCode: string; operator: string; network: string | null }> };
      supplierNetworks?: { list: Array<{ countryCode: string; operator: string; network: string | null }> } | null;
    }>();
  if (!plan) return [];
  const networks = plan.coverage.networks.length ? plan.coverage.networks : (plan.supplierNetworks?.list ?? []);
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    names = null;
  }
  const countries = plan.coverage.countries.map((country) => {
    let name = country.name;
    try {
      name = names?.of(country.code.toUpperCase()) ?? country.name;
    } catch {
      // Not a region code Intl knows: keep the catalogue's name.
    }
    return { code: country.code, name: name || country.name };
  });
  return coverageByCountry(
    countries,
    networks.map((network) => ({ countryCode: network.countryCode, operator: network.operator, network: network.network ?? null })),
    locale,
  );
}
