import { EsimDestinationDetail, EsimDestinationList } from "@/contracts/mobile/shop/v1/esim";
import { MobileApiError } from "@/lib/api-core/errors";
import { defineRoute } from "@/lib/api-core/registry";
import { connectDB } from "@/lib/db";
import { getStoreCurrency } from "@/lib/intl/server-currency";
import { listDestinations, regionNamesFor } from "@/lib/esim/storefront/catalog";
import { getLocalizedDestination, localizeDestinations } from "@/lib/esim/storefront/destination-names";
import { filterPlans } from "@/lib/esim/storefront/plan-filter";
import { translator } from "@/lib/esim/i18n/server";
import { planFilterViews } from "./plan-filters";
import { toEsimDestination, toEsimDestinationDetail } from "./dto";

/**
 * The shopper app's destinations and plans (APP-02): the website's own
 * catalogue reader (lib/esim/storefront/catalog.ts, cached and cleared on
 * publish), so the app lists exactly what the website sells.
 */

/** GET /esim/destinations: countries (by name), regions and global plans. */
export const esimDestinationsRoute = defineRoute({
  id: "esim.destinations.list",
  method: "GET",
  path: "/esim/destinations",
  auth: "none",
  cache: { kind: "public", sMaxAge: 300, swr: 600 },
  rateLimit: { bucket: "catalog:esim-destinations", preset: "browse" },
  output: EsimDestinationList,
  handler: async ({ locale }) => {
    await connectDB();
    const [destinations, currency] = await Promise.all([listDestinations(), getStoreCurrency()]);
    const shaped = (await localizeDestinations(destinations, locale)).map((destination) => toEsimDestination(destination, currency));
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    return {
      local: shaped.filter((entry) => entry.scope === "local").sort(byName),
      regional: shaped.filter((entry) => entry.scope === "regional").sort(byName),
      global: shaped.filter((entry) => entry.scope === "global").sort((a, b) => (a.fromPrice?.amount ?? Infinity) - (b.fromPrice?.amount ?? Infinity)),
    };
  },
});

/** GET /esim/destinations/{scope}/{slug}: one destination with its plans. */
export const esimDestinationRoute = defineRoute({
  id: "esim.destinations.detail",
  method: "GET",
  path: "/esim/destinations/{scope}/{slug}",
  auth: "none",
  cache: { kind: "public", sMaxAge: 300, swr: 600 },
  rateLimit: { bucket: "catalog:esim-destination", preset: "browse" },
  output: EsimDestinationDetail,
  handler: async ({ params, locale }) => {
    if (params.scope !== "local" && params.scope !== "multi") throw new MobileApiError(404, "NOT_FOUND", "Destination not found.");
    await connectDB();
    const [found, currency, t] = await Promise.all([getLocalizedDestination(params.slug, params.scope, locale), getStoreCurrency(), translator(locale)]);
    if (!found) throw new MobileApiError(404, "NOT_FOUND", "Destination not found.");
    // The website's order (shortest first, then kind, data and price); a country's own plans and those of the regions that cover it.
    const destination = { ...found, variants: filterPlans(found.variants, {}) };
    const filters = planFilterViews(destination.variants, {
      t,
      countryCodes: destination.countries.map((country) => country.code),
      regionNames: regionNamesFor(destination, locale),
    });
    return toEsimDestinationDetail(destination, currency, filters);
  },
});
