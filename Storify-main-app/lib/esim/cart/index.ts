import "server-only";

import { mongoose } from "@/lib/db";
import { CartRefusal } from "@/lib/cart/cart-refusal";
import { ValidationError } from "@/lib/api/errors";
import type { PerDayPricing } from "@/lib/esim/catalog/variants";
import { EsimProductLink } from "@/models/esim-product-link.model";
import {
  LineAttributesError,
  lineDays,
  linePriceMinor,
  lineVariantName,
  parseLineAttributes,
  resolveLineAttributes,
  type EsimLineAttributes,
} from "@/lib/esim/cart/line-attributes";
import { isTopupVariant } from "@/lib/esim/topup/product";
import { priceTopupCosts, quoteStillEligible, quoteWithPlan } from "@/lib/esim/topup/offers";
import { topupLineLabel } from "@/lib/esim/topup/label";
import { isWalletVariant } from "@/lib/esim/wallet/product";
import { walletFeeMinor } from "@/lib/esim/wallet/booking";
import { getEsimSettings } from "@/models/esim-pricing.model";
import { kycState, variantsNeedingKyc } from "@/lib/esim/kyc/service";

/**
 * The eSIM side of patch point P10: what Storify's cart and checkout ask about
 * a line's `lineAttributes`. Storify prices a line from its variant; a
 * day-priced eSIM variant is priced here instead, per day × the chosen days,
 * a top-up line from its quote (lib/esim/topup), and a wallet top-up line as
 * its amount plus the fee (lib/esim/wallet).
 *
 * - `esimCartLine` — adding to the cart (`lib/cart/cart-service.ts`).
 * - `esimLinePrices` — every place checkout re-prices lines from the live
 *   catalogue (prepare-checkout, the Stripe card intent, `POST /api/orders`).
 */

export type { EsimLineAttributes };
export { withLineDays } from "@/lib/esim/cart/line-attributes";

const toUnits = (minor: number) => Math.round(minor) / 100;

type VariantInfo = { name: string; perDay: PerDayPricing | null };

/** The published eSIM variants among these ids; others are not in the map. */
async function variantInfo(variantIds: unknown[]): Promise<Map<string, VariantInfo>> {
  const ids = [...new Set(variantIds.filter(Boolean).map(String))].filter((id) => mongoose.isValidObjectId(id));
  const result = new Map<string, VariantInfo>();
  if (!ids.length) return result;
  const links = await EsimProductLink.find({ "variants.variantId": { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } })
    .select({ variants: 1 })
    .lean();
  for (const link of links) {
    for (const variant of link.variants) {
      result.set(String(variant.variantId), { name: variant.name, perDay: variant.perDay ?? null });
    }
  }
  return result;
}

/** A top-up quote is good for checkout for a week; after that the shopper picks the top-up again. */
const QUOTE_VALID_MS = 7 * 86_400_000;

type TopupLine = { lineAttributes: EsimLineAttributes; priceMinor: number; label: string };

/** A top-up line's settled attributes and price, or why it cannot be bought. */
async function topupLine(quoteId: string | undefined, userId: string | undefined, checkEligible: boolean): Promise<TopupLine | string> {
  if (!quoteId) return "Choose the top-up from your eSIM's page";
  const found = await quoteWithPlan(quoteId);
  if (!found) return "This top-up offer is no longer available; choose it again from your eSIM's page";
  const { quote, plan } = found;
  if (!userId || String(quote.customer) !== userId) return "Sign in to the account that owns the eSIM to top it up";
  if (Date.now() - quote.createdAt.getTime() > QUOTE_VALID_MS) return "This top-up offer has expired; choose it again from your eSIM's page";
  if (checkEligible && !(await quoteStillEligible(quote, userId))) return "This eSIM cannot be topped up any more";
  const [priceMinor] = await priceTopupCosts([quote.cost], plan);
  if (!priceMinor) return "This top-up cannot be priced right now";
  const label = topupLineLabel(quote);
  return { lineAttributes: { topup: String(quote._id), iccid: quote.iccid, label }, priceMinor, label };
}

/** A wallet top-up line's settled attributes and price, or why it cannot be bought. */
async function walletLine(amountMinor: number | undefined, userId: string | undefined): Promise<TopupLine | string> {
  if (!userId) return "Sign in to add money to your balance";
  const wallet = (await getEsimSettings()).wallet;
  if (!wallet?.enabled) return "Adding money to your balance is not available";
  if (!amountMinor) return "Choose how much to add";
  if (amountMinor < wallet.minMinor || amountMinor > wallet.maxMinor) {
    return `Choose between ${(wallet.minMinor / 100).toFixed(2)} and ${(wallet.maxMinor / 100).toFixed(2)}`;
  }
  const fee = walletFeeMinor(amountMinor, wallet);
  const label = `Wallet top-up · ${(amountMinor / 100).toFixed(2)}${fee ? ` + ${(fee / 100).toFixed(2)} fee` : ""}`;
  return { lineAttributes: { wallet: amountMinor, walletFee: fee, label }, priceMinor: amountMinor + fee, label };
}

/**
 * The attributes, unit price and variant name a line is added to the cart
 * with, or `null` when the line is an ordinary one (no attributes, not a
 * day-priced eSIM, not a top-up). Refuses attributes the variant does not
 * take. `singleUnit`: the line is always one unit — adding it again replaces
 * it (a top-up: one per eSIM, bought once).
 */
export async function esimCartLine(
  line: { variantId?: unknown; quantity?: number; lineAttributes?: unknown },
  context: { userId?: string } = {},
): Promise<{ lineAttributes: EsimLineAttributes & Record<string, unknown>; price: number; variantName: string; singleUnit?: boolean } | null> {
  try {
    const requested = parseLineAttributes(line.lineAttributes);
    if (await isTopupVariant(line.variantId)) {
      if (!context.userId) throw new LineAttributesError("Sign in to top up an eSIM");
      if ((line.quantity ?? 1) !== 1) throw new LineAttributesError("A top-up is bought one at a time");
      const topup = await topupLine(requested?.topup, context.userId, true);
      if (typeof topup === "string") throw new LineAttributesError(topup);
      return { lineAttributes: { ...topup.lineAttributes }, price: toUnits(topup.priceMinor), variantName: topup.label, singleUnit: true };
    }
    if (await isWalletVariant(line.variantId)) {
      if ((line.quantity ?? 1) !== 1) throw new LineAttributesError("Add one amount at a time");
      const wallet = await walletLine(requested?.wallet, context.userId);
      if (typeof wallet === "string") throw new LineAttributesError(wallet);
      return { lineAttributes: { ...wallet.lineAttributes }, price: toUnits(wallet.priceMinor), variantName: wallet.label, singleUnit: true };
    }
    if (requested?.topup) throw new LineAttributesError("This product is not a top-up");
    if (requested?.wallet) throw new LineAttributesError("This product is not a wallet top-up");
    const info = line.variantId ? (await variantInfo([line.variantId])).get(String(line.variantId)) : undefined;
    if (!info) {
      if (requested) throw new LineAttributesError("This product takes no options of that kind");
      return null;
    }
    // KYC-03: a plan that needs identity verification is not sold to guests.
    if (!context.userId && (await variantsNeedingKyc([line.variantId])).size) {
      throw new LineAttributesError("Sign in to buy this eSIM: it needs identity verification");
    }
    const lineAttributes = resolveLineAttributes(requested, info.perDay);
    if (!lineAttributes || !info.perDay) return null;
    const days = lineAttributes.days ?? info.perDay.defaultDays;
    return {
      lineAttributes: { ...lineAttributes },
      price: toUnits(linePriceMinor(info.perDay, days)),
      variantName: lineVariantName(info.name, days),
    };
  } catch (error) {
    // Storify's refusal reasons are a closed list; the message says what is wrong.
    if (error instanceof LineAttributesError) throw new CartRefusal(error.message, "not_available");
    throw error;
  }
}

/**
 * The unit price of each day-priced eSIM line and each top-up line, keyed by
 * the line object, for the checkout re-pricing to use instead of the
 * variant's price. Lines not in the map are priced as Storify prices them.
 *
 * Each such line's `lineAttributes` is settled in place: the days are kept
 * within the variant's range (it can change while a cart waits), and a line
 * whose variant is no longer day-priced loses them — so the order is written
 * with the days it was charged for. A top-up line is priced from its quote
 * and refused (a validation error, as for an item out of stock) when the
 * quote is gone, expired or not the shopper's, or the line is not one unit:
 * its variant's own price is a placeholder that must never be charged.
 */
export async function esimLinePrices<T extends { variantId?: unknown; lineAttributes?: unknown; quantity?: number }>(
  items: readonly T[],
  context: { userId?: string | null } = {},
): Promise<Map<T, number>> {
  const prices = new Map<T, number>();
  for (const item of items) {
    if (!(await isWalletVariant(item.variantId))) continue;
    // Balance is bought on its own: its order is booked and credited as a whole (patch P19).
    const wallet = items.length !== 1
      ? "Check out a wallet top-up on its own: remove the other items from your cart, or the top-up"
      : (item.quantity ?? 1) !== 1
        ? "Add one amount at a time"
        : await walletLine((item.lineAttributes as EsimLineAttributes | undefined)?.wallet, context.userId ?? undefined);
    if (typeof wallet === "string") throw new ValidationError({ stock: [wallet] });
    item.lineAttributes = wallet.lineAttributes;
    prices.set(item, toUnits(wallet.priceMinor));
  }
  for (const item of items) {
    if (!(await isTopupVariant(item.variantId))) continue;
    const attributes = item.lineAttributes && typeof item.lineAttributes === "object" ? (item.lineAttributes as EsimLineAttributes) : {};
    const topup = (item.quantity ?? 1) !== 1
      ? "A top-up is bought one at a time; remove the extra from your cart"
      : await topupLine(attributes.topup, context.userId ?? undefined, false);
    if (typeof topup === "string") throw new ValidationError({ stock: [topup] });
    item.lineAttributes = topup.lineAttributes;
    prices.set(item, toUnits(topup.priceMinor));
  }
  const info = await variantInfo(items.map((item) => item.variantId));
  if (!info.size) return prices;
  // KYC-03: plans that need identity verification are paid for only by a verified shopper.
  if ((await variantsNeedingKyc([...info.keys()])).size) {
    const verified = context.userId ? (await kycState(context.userId)).status === "approved" : false;
    if (!verified) {
      throw new ValidationError({
        stock: [context.userId
          ? "An eSIM in your cart needs identity verification. Verify your identity in My eSIMs → Identity verification, then check out."
          : "An eSIM in your cart needs identity verification: sign in and verify your identity first."],
      });
    }
  }
  for (const item of items) {
    const variant = info.get(String(item.variantId ?? ""));
    if (!variant) continue;
    if (!variant.perDay) {
      if (item.lineAttributes) item.lineAttributes = undefined;
      continue;
    }
    const days = lineDays(item.lineAttributes, variant.perDay);
    item.lineAttributes = { days } satisfies EsimLineAttributes;
    prices.set(item, toUnits(linePriceMinor(variant.perDay, days)));
  }
  return prices;
}

/** Per-day pricing of a product's day-priced variants, for the product page's day picker. */
export async function esimDayPricing(productId: string): Promise<Record<string, PerDayPricing>> {
  if (!mongoose.isValidObjectId(productId)) return {};
  const link = await EsimProductLink.findOne({ product: new mongoose.Types.ObjectId(productId) }).select({ variants: 1 }).lean();
  const result: Record<string, PerDayPricing> = {};
  for (const variant of link?.variants ?? []) {
    if (variant.perDay) result[String(variant.variantId)] = variant.perDay;
  }
  return result;
}
