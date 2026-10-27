import { EsimDetail, EsimList, EsimRefreshInput } from "@/contracts/mobile/shop/v1/esim";
import { MobileApiError } from "@/lib/api-core/errors";
import { defineRoute, type RouteEntry } from "@/lib/api-core/registry";
import { connectDB } from "@/lib/db";
import { getCustomerEsim, listCustomerEsims, refreshCustomerEsim } from "@/lib/esim/account/esims";
import { esimDestinationRoute, esimDestinationsRoute } from "./destinations";
import { toEsimDetail, toEsimSummary } from "./dto";

/**
 * The shopper app's eSIMs (APP-03/04): the website's own readers
 * (lib/esim/account/esims.ts) in the contract's shape — so ownership, the
 * once-a-minute supplier refresh and the status rules are the website's.
 */

function esimNotFound(): MobileApiError {
  return new MobileApiError(404, "NOT_FOUND", "eSIM not found.");
}

/** GET /me/esims: the shopper's eSIMs, newest first. */
export const myEsimsRoute = defineRoute({
  id: "me.esims.list",
  method: "GET",
  path: "/me/esims",
  auth: "user",
  cache: { kind: "private" },
  etag: true,
  output: EsimList,
  handler: async ({ session }) => {
    await connectDB();
    return { items: (await listCustomerEsims(session.user.id)).map(toEsimSummary) };
  },
});

/** GET /me/esims/{id}: one of the shopper's eSIMs, with how to install it. */
export const myEsimRoute = defineRoute({
  id: "me.esims.detail",
  method: "GET",
  path: "/me/esims/{id}",
  auth: "user",
  cache: { kind: "private" },
  etag: true,
  output: EsimDetail,
  handler: async ({ session, params }) => {
    await connectDB();
    const view = await getCustomerEsim(session.user.id, params.id);
    if (!view) throw esimNotFound();
    return toEsimDetail(view);
  },
});

/** POST /me/esims/{id}/refresh: fresh usage from the supplier, at most once a minute. */
export const refreshMyEsimRoute = defineRoute({
  id: "me.esims.refresh",
  method: "POST",
  path: "/me/esims/{id}/refresh",
  auth: "user",
  cache: { kind: "private" },
  input: EsimRefreshInput,
  output: EsimDetail,
  rateLimit: { bucket: "esim:refresh", preset: "moderate" },
  demo: "allow",
  handler: async ({ session, params }) => {
    await connectDB();
    const result = await refreshCustomerEsim(session.user.id, params.id);
    if (!result.view) throw esimNotFound();
    return toEsimDetail(result.view);
  },
});

/** The eSIM module's shopper endpoints, for the API's route list (patch P22). */
export const esimShopRoutes: readonly RouteEntry[] = [myEsimsRoute, myEsimRoute, refreshMyEsimRoute, esimDestinationsRoute, esimDestinationRoute];
