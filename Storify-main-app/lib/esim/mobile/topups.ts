import { EsimTopupQuote, EsimTopupQuoteRequest, EsimTopups } from "@/contracts/mobile/shop/v1/esim";
import { MobileApiError } from "@/lib/api-core/errors";
import { defineRoute } from "@/lib/api-core/registry";
import { toMoney } from "@/lib/api-core/shop/money";
import { connectDB } from "@/lib/db";
import { formatBytes } from "@/lib/esim/account/display";
import { ProviderError } from "@/lib/esim/providers/types";
import { TopupError, createTopupQuote, topupOffers } from "@/lib/esim/topup/offers";
import { getStoreCurrency } from "@/lib/intl/server-currency";

/**
 * The shopper app's top-ups (APP-06): the website's own offers and quotes
 * (lib/esim/topup/offers.ts), so eligibility, pricing and the checkout's
 * re-check are the website's.
 */

const notFound = () => new MobileApiError(404, "NOT_FOUND", "eSIM not found.");

/** GET /me/esims/{id}/topups: what this eSIM can take now, priced. */
export const esimTopupsRoute = defineRoute({
  id: "me.esims.topups",
  method: "GET",
  path: "/me/esims/{id}/topups",
  auth: "user",
  cache: { kind: "private" },
  output: EsimTopups,
  rateLimit: { bucket: "esim:topup:list", preset: "moderate" },
  handler: async ({ session, params }) => {
    await connectDB();
    const [offers, currency] = await Promise.all([topupOffers(session.user.id, params.id), getStoreCurrency()]);
    if (!offers) throw notFound();
    return {
      ...(offers.eligibility.ok ? {} : { refusal: offers.eligibility.reason }),
      ...(offers.mode ? { mode: offers.mode } : {}),
      offers: offers.offers.map((offer) => ({
        topupPlanId: offer.topupPlanId,
        name: offer.name,
        data: formatBytes(offer.megabytes * 1024 * 1024),
        validityDays: offer.validityDays,
        price: toMoney(offer.priceMinor / 100, currency),
      })),
      unavailable: Boolean(offers.error),
    };
  },
});

/** POST /me/esims/{id}/topups/quote: one top-up fixed for the cart. */
export const esimTopupQuoteRoute = defineRoute({
  id: "me.esims.topups.quote",
  method: "POST",
  path: "/me/esims/{id}/topups/quote",
  auth: "user",
  cache: { kind: "private" },
  input: EsimTopupQuoteRequest,
  output: EsimTopupQuote,
  rateLimit: { bucket: "esim:topup:quote", preset: "moderate" },
  demo: "default",
  handler: async ({ session, params, input }) => {
    await connectDB();
    try {
      const [quote, currency] = await Promise.all([createTopupQuote(session.user.id, params.id, input.topupPlanId), getStoreCurrency()]);
      if (!quote) throw notFound();
      return {
        productId: quote.product.productId,
        variantId: quote.product.variantId,
        lineAttributes: { topup: quote.quoteId },
        label: quote.label,
        price: toMoney(quote.priceMinor / 100, currency),
      };
    } catch (error) {
      if (error instanceof TopupError || error instanceof ProviderError) {
        throw new MobileApiError(409, "CONFLICT", error.message);
      }
      throw error;
    }
  },
});
