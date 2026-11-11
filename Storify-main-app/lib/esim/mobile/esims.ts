import { EsimCancelInput, EsimDetail, EsimList, EsimRefreshInput } from "@/contracts/mobile/shop/v1/esim";
import { toMoney } from "@/lib/api-core/shop/money";
import { CancelError, cancelByShopper, shopperCancelOffer } from "@/lib/esim/cancel/service";
import { getStoreCurrency } from "@/lib/intl/server-currency";
import { MobileApiError } from "@/lib/api-core/errors";
import { defineRoute, type RouteEntry } from "@/lib/api-core/registry";
import { connectDB } from "@/lib/db";
import { getCustomerEsim, listCustomerEsims, refreshCustomerEsim } from "@/lib/esim/account/esims";
import { esimReferralCodeRoute, esimReferralsRoute, esimWalletRoute } from "./account";
import { esimDestinationRoute, esimDestinationsRoute } from "./destinations";
import { esimDevicesRoute } from "./devices";
import { esimPlanDetailsRoute } from "./plan-details";
import { esimKycFileRoute, esimKycRoute, esimKycSubmitRoute } from "./kyc";
import { toEsimDetail, toEsimSummary } from "./dto";
import { esimTopupQuoteRoute, esimTopupsRoute } from "./topups";

/**
 * The shopper app's eSIMs (APP-03/04): the website's own readers
 * (lib/esim/account/esims.ts) in the contract's shape — so ownership, the
 * once-a-minute supplier refresh and the status rules are the website's.
 */

/** The cancellation offer in the contract's shape, when the eSIM can be cancelled. */
async function cancellationOf(userId: string, esimId: string) {
  const [offer, currency] = await Promise.all([shopperCancelOffer(userId, esimId), getStoreCurrency()]);
  if (!offer?.allowed) return undefined;
  return {
    refund: toMoney(offer.refundMinor / 100, currency),
    fee: toMoney(offer.feeMinor / 100, currency),
    toBalance: offer.refundTo === "balance",
  };
}

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
    return toEsimDetail(view, await cancellationOf(session.user.id, params.id));
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
    return toEsimDetail(result.view, await cancellationOf(session.user.id, params.id));
  },
});

/** POST /me/esims/{id}/cancel: the shopper cancels an eSIM not installed yet (USR-07). */
export const cancelMyEsimRoute = defineRoute({
  id: "me.esims.cancel",
  method: "POST",
  path: "/me/esims/{id}/cancel",
  auth: "user",
  cache: { kind: "private" },
  input: EsimCancelInput,
  output: EsimDetail,
  rateLimit: { bucket: "esim:cancel", preset: "strict" },
  demo: "block-mutations",
  handler: async ({ session, params }) => {
    await connectDB();
    try {
      await cancelByShopper(session.user.id, params.id);
    } catch (error) {
      if (!(error instanceof CancelError)) throw error;
      if (error.message === "eSIM not found") throw esimNotFound();
      throw new MobileApiError(409, "CONFLICT", "This eSIM can no longer be cancelled.", { reason: error.message === "supplier" ? "SUPPLIER_REFUSED" : "NOT_CANCELLABLE" });
    }
    const view = await getCustomerEsim(session.user.id, params.id);
    if (!view) throw esimNotFound();
    return toEsimDetail(view);
  },
});

/** The eSIM module's shopper endpoints, for the API's route list (patch P22). */
export const esimShopRoutes: readonly RouteEntry[] = [myEsimsRoute, myEsimRoute, refreshMyEsimRoute, esimDestinationsRoute, esimDestinationRoute, esimPlanDetailsRoute, esimTopupsRoute, esimTopupQuoteRoute, esimDevicesRoute, esimWalletRoute, esimReferralsRoute, esimReferralCodeRoute, esimKycRoute, esimKycFileRoute, esimKycSubmitRoute, cancelMyEsimRoute];
