import { EsimCancelInput, EsimDeleted, EsimDetail, EsimList, EsimRefreshInput } from "@/contracts/mobile/shop/v1/esim";
import { toMoney } from "@/lib/api-core/shop/money";
import { CancelError, cancelByShopper, shopperCancelOffer } from "@/lib/esim/cancel/service";
import { getStoreCurrency } from "@/lib/intl/server-currency";
import { MobileApiError } from "@/lib/api-core/errors";
import { defineRoute, type RouteEntry } from "@/lib/api-core/registry";
import { connectDB } from "@/lib/db";
import { getCustomerEsim, hideCustomerEsim, listCustomerEsims, refreshCustomerEsim } from "@/lib/esim/account/esims";
import { esimReferralCodeRoute, esimReferralsRoute, esimWalletRoute } from "./account";
import { esimDestinationRoute, esimDestinationsRoute } from "./destinations";
import { esimDevicesRoute } from "./devices";
import { esimPlanDetailsRoute } from "./plan-details";
import { esimKycFileRoute, esimKycRoute, esimKycSubmitRoute } from "./kyc";
import { toEsimDetail, toEsimSummary } from "./dto";
import { esimCoverage } from "@/lib/esim/account/coverage";
import { esimTopupQuoteRoute, esimTopupsRoute } from "./topups";
import { esimNumberPriceRoute, esimNumberQuoteRoute, esimNumberShopRoute } from "./number-shop";
import { cancelMyNumberPacketRoute, myNumberRemarkRoute, myNumberRoute, myNumbersRoute, myNumberTopupQuoteRoute, refreshMyNumberRoute } from "./numbers";
import {
  forwardMyNumberRoute,
  myNumberDataLimitRoute,
  myNumberDiagnosticsRoute,
  myNumberHistoryRoute,
  myNumberServicesRoute,
  reconnectMyNumberRoute,
  setMyNumberDataLimitRoute,
  setMyNumberServiceRoute,
  smsMyNumberRoute,
  transferFromMyNumberRoute,
} from "./number-services";
import { myNumberOwnerRoute, myNumberQrRoute, myNumberStatementRoute, myNumberVoucherRoute, releaseMyNumberRoute } from "./number-manage";

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

/** The eSIM's countries and operators, added to its detail (left out when unknown). */
async function withCoverage(detail: EsimDetail, userId: string, esimId: string, locale: string): Promise<EsimDetail> {
  const countries = await esimCoverage(userId, esimId, locale).catch(() => []);
  if (!countries.length) return detail;
  return {
    ...detail,
    coverage: countries.map((country) => ({
      code: country.code,
      name: country.name,
      operators: country.operators.map((entry) => ({ operator: entry.operator, ...(entry.network ? { network: entry.network } : {}) })),
    })),
  };
}

/** GET /me/esims/{id}: one of the shopper's eSIMs, with how to install it. */
export const myEsimRoute = defineRoute({
  id: "me.esims.detail",
  method: "GET",
  path: "/me/esims/{id}",
  auth: "user",
  cache: { kind: "private" },
  etag: true,
  output: EsimDetail,
  handler: async ({ session, params, locale }) => {
    await connectDB();
    const view = await getCustomerEsim(session.user.id, params.id);
    if (!view) throw esimNotFound();
    return withCoverage(await toEsimDetail(view, await cancellationOf(session.user.id, params.id)), session.user.id, params.id, locale);
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
  handler: async ({ session, params, locale }) => {
    await connectDB();
    const result = await refreshCustomerEsim(session.user.id, params.id);
    if (!result.view) throw esimNotFound();
    return withCoverage(await toEsimDetail(result.view, await cancellationOf(session.user.id, params.id)), session.user.id, params.id, locale);
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

/**
 * DELETE /me/esims/{id}: the shopper deletes the eSIM from their list. It is
 * only hidden from them (website and app); nothing is cancelled or refunded.
 * One already deleted answers 404, so the app drops it either way.
 */
export const deleteMyEsimRoute = defineRoute({
  id: "me.esims.delete",
  method: "DELETE",
  path: "/me/esims/{id}",
  auth: "user",
  cache: { kind: "private" },
  output: EsimDeleted,
  rateLimit: { bucket: "esim:delete", preset: "moderate" },
  demo: "allow",
  handler: async ({ session, params }) => {
    await connectDB();
    if (!(await hideCustomerEsim(session.user.id, params.id))) throw esimNotFound();
    return { id: params.id, deleted: true as const };
  },
});

/** The phone numbers (NUM-03~09): the numbers page and the shopper's own numbers. */
const ESIM_NUMBER_ROUTES: readonly RouteEntry[] = [
  esimNumberShopRoute,
  esimNumberPriceRoute,
  esimNumberQuoteRoute,
  myNumbersRoute,
  myNumberRoute,
  myNumberRemarkRoute,
  refreshMyNumberRoute,
  cancelMyNumberPacketRoute,
  myNumberTopupQuoteRoute,
  myNumberServicesRoute,
  setMyNumberServiceRoute,
  forwardMyNumberRoute,
  myNumberDataLimitRoute,
  setMyNumberDataLimitRoute,
  myNumberHistoryRoute,
  myNumberDiagnosticsRoute,
  reconnectMyNumberRoute,
  smsMyNumberRoute,
  transferFromMyNumberRoute,
  myNumberQrRoute,
  myNumberOwnerRoute,
  releaseMyNumberRoute,
  myNumberVoucherRoute,
  myNumberStatementRoute,
];

/** The eSIM module's shopper endpoints, for the API's route list (patch P22). */
export const esimShopRoutes: readonly RouteEntry[] = [myEsimsRoute, myEsimRoute, refreshMyEsimRoute, esimDestinationsRoute, esimDestinationRoute, esimPlanDetailsRoute, esimTopupsRoute, esimTopupQuoteRoute, esimDevicesRoute, esimWalletRoute, esimReferralsRoute, esimReferralCodeRoute, esimKycRoute, esimKycFileRoute, esimKycSubmitRoute, cancelMyEsimRoute, deleteMyEsimRoute, ...ESIM_NUMBER_ROUTES];
