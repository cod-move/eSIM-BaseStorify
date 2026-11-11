import {
  EsimNumberPrice,
  EsimNumberPriceQuery,
  EsimNumberQuote,
  EsimNumberQuoteRequest,
  EsimNumberShop,
  EsimNumberShopQuery,
} from "@/contracts/mobile/shop/v1/esim";
import { MobileApiError } from "@/lib/api-core/errors";
import { defineRoute } from "@/lib/api-core/registry";
import { toMoney } from "@/lib/api-core/shop/money";
import { connectDB } from "@/lib/db";
import { translator } from "@/lib/esim/i18n/server";
import { numberCartLine, RESERVATION_MINUTES } from "@/lib/esim/numbers/cart-line";
import { findNumberProduct } from "@/lib/esim/numbers/product";
import { numberShop } from "@/lib/esim/numbers/storefront";
import { cardChargeRate, cardUsdMinor } from "@/lib/esim/numbers/line";
import { currentRates } from "@/lib/esim/pricing/fx-service";
import { getStoreCurrency } from "@/lib/intl/server-currency";
import { EsimNumber } from "@/models/esim-number.model";
import { EsimNumberPackage } from "@/models/esim-number-package.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { getEsimSettings } from "@/models/esim-pricing.model";
import { cardMoney, displayNumber, numberRisks, packetGroupViews, rechargeView } from "./number-dto";
import { NUMBER_REASONS, numberRefused } from "./number-refusals";

/**
 * The shopper app's numbers page (NUM-03/04): the website's own reader
 * (lib/esim/numbers/storefront.ts), so the app lists exactly the numbers the
 * website sells. Anyone may browse; the quote — the cart line for a number
 * with its first credit and data package — needs a signed-in shopper, as
 * the website's cart does (guests buy data eSIMs only). The cart prices the
 * line again and holds the number once checkout starts.
 */

/** GET /esim/numbers: numbers on sale, filtered, 24 a page; with what can be added to one. */
export const esimNumberShopRoute = defineRoute({
  id: "esim.numbers.shop",
  method: "GET",
  path: "/esim/numbers",
  auth: "none",
  cache: { kind: "public", sMaxAge: 30, swr: 60 },
  rateLimit: { bucket: "catalog:esim-numbers", preset: "browse" },
  input: EsimNumberShopQuery,
  output: EsimNumberShop,
  handler: async ({ input, locale }) => {
    await connectDB();
    const [shop, t] = await Promise.all([
      numberShop({ dialCode: input.code, digits: input.digits, premium: input.premium ?? "all", page: input.page ?? 1 }),
      translator(locale),
    ]);
    const currency = shop.recharge.currency;
    return {
      items: shop.rows.map((row) => ({
        id: row.id,
        dialCode: row.dialCode,
        nationalNumber: row.nationalNumber,
        display: displayNumber(row.dialCode, row.nationalNumber),
        ...(row.country ? { country: row.country } : {}),
        numberPrice: cardMoney(row.priceMinor, currency),
        ...(row.premiumMinor > 0 ? { premium: cardMoney(row.premiumMinor, currency) } : {}),
        price: cardMoney(row.priceMinor + row.premiumMinor, currency),
      })),
      total: shop.total,
      page: shop.page,
      pages: shop.pages,
      dialCodes: shop.dialCodes.map((entry) => ({ code: entry.code, ...(entry.country ? { country: entry.country } : {}), count: entry.count })),
      packetGroups: packetGroupViews(shop.packets, currency, locale, t),
      recharge: rechargeView(shop.recharge),
      buyable: shop.product !== null && shop.recharge.usdPerUnit !== null,
      risks: numberRisks(t),
      holdMinutes: RESERVATION_MINUTES,
    };
  },
});

/** POST /me/esim-numbers/quote: the cart line for a number, checked and priced. */
export const esimNumberQuoteRoute = defineRoute({
  id: "me.esim-numbers.quote",
  method: "POST",
  path: "/me/esim-numbers/quote",
  auth: "user",
  cache: { kind: "private" },
  input: EsimNumberQuoteRequest,
  output: EsimNumberQuote,
  reasons: NUMBER_REASONS,
  rateLimit: { bucket: "esim:number:quote", preset: "moderate" },
  demo: "default",
  handler: async ({ session, input }) => {
    await connectDB();
    const choice = { id: input.id, recharge: input.recharge, ...(input.packet ? { packet: input.packet } : {}) };
    const [line, product, currency] = await Promise.all([numberCartLine(choice, session.user.id), findNumberProduct(), getStoreCurrency()]);
    if (typeof line === "string") throw numberRefused(line);
    if (!product) throw numberRefused("Number services are not available right now");
    return {
      productId: product.productId,
      variantId: product.variantId,
      // The choice, not the snapshot: the cart settles it again (lib/esim/cart).
      lineAttributes: { number: choice },
      label: line.label,
      price: toMoney(line.priceMinor / 100, currency),
    };
  },
});

/**
 * GET /esim/numbers/price: what a choice comes to while the shopper picks —
 * in the card currency, and what checkout charges for it in the store's
 * currency, each part rounded up as the cart does (lib/esim/numbers/line.ts).
 * Only an estimate for showing: the cart prices the line again.
 */
export const esimNumberPriceRoute = defineRoute({
  id: "esim.numbers.price",
  method: "GET",
  path: "/esim/numbers/price",
  auth: "none",
  cache: { kind: "public", sMaxAge: 60, swr: 120 },
  rateLimit: { bucket: "catalog:esim-number-price", preset: "browse" },
  input: EsimNumberPriceQuery,
  output: EsimNumberPrice,
  handler: async ({ input }) => {
    await connectDB();
    const [number, packet, provider, settings, storeCurrency] = await Promise.all([
      input.id ? EsimNumber.findOne({ _id: input.id, customer: null }).select({ priceMinor: 1, premiumMinor: 1 }).lean() : null,
      input.packet ? EsimNumberPackage.findOne({ _id: input.packet, status: "active" }).select({ retailPriceMinor: 1 }).lean() : null,
      EsimProvider.findOne({ code: "topconnect" }).select({ settlementCurrency: 1 }).lean(),
      getEsimSettings(),
      getStoreCurrency(),
    ]);
    if (input.id && !number) throw new MobileApiError(404, "NOT_FOUND", "Number not found.");
    if (input.packet && !packet) throw new MobileApiError(404, "NOT_FOUND", "Data package not found.");
    const currency = provider?.settlementCurrency ?? "EUR";
    const parts = [number ? number.priceMinor + number.premiumMinor : 0, input.recharge ?? 0, packet?.retailPriceMinor ?? 0];
    const rate = (await currentRates([currency])).get(currency);
    const chargeRate = rate ? cardChargeRate(rate.usdPerUnit, settings.fxBufferPercent) : null;
    return {
      total: cardMoney(parts.reduce((sum, part) => sum + part, 0), currency),
      ...(chargeRate ? { charged: toMoney(parts.reduce((sum, part) => sum + cardUsdMinor(part, chargeRate), 0) / 100, storeCurrency) } : {}),
    };
  },
});
