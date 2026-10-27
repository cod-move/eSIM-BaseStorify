import { EsimDestinationDetail, EsimDestinationList } from "@/contracts/mobile/shop/v1/esim";
import { MobileApiError } from "@/lib/api-core/errors";
import { defineRoute } from "@/lib/api-core/registry";
import { connectDB } from "@/lib/db";
import { getStoreCurrency } from "@/lib/intl/server-currency";
import { getDestination, listDestinations } from "@/lib/esim/storefront/catalog";
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
  handler: async () => {
    await connectDB();
    const [destinations, currency] = await Promise.all([listDestinations(), getStoreCurrency()]);
    const shaped = destinations.map((destination) => toEsimDestination(destination, currency));
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
  handler: async ({ params }) => {
    if (params.scope !== "local" && params.scope !== "multi") throw new MobileApiError(404, "NOT_FOUND", "Destination not found.");
    await connectDB();
    const [destination, currency] = await Promise.all([getDestination(params.slug, params.scope), getStoreCurrency()]);
    if (!destination) throw new MobileApiError(404, "NOT_FOUND", "Destination not found.");
    return toEsimDestinationDetail(destination, currency);
  },
});
