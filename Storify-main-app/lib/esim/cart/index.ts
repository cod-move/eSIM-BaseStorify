import "server-only";

import { mongoose } from "@/lib/db";
import { CartRefusal } from "@/lib/cart/cart-refusal";
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

/**
 * The eSIM side of patch point P10: what Storify's cart and checkout ask about
 * a line's `lineAttributes`. Storify prices a line from its variant; a
 * day-priced eSIM variant is priced here instead, per day × the chosen days.
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

/**
 * The attributes, unit price and variant name a line is added to the cart
 * with, or `null` when the line is an ordinary one (no attributes, not a
 * day-priced eSIM). Refuses attributes the variant does not take.
 */
export async function esimCartLine(line: {
  variantId?: unknown;
  lineAttributes?: unknown;
}): Promise<{ lineAttributes: EsimLineAttributes & Record<string, unknown>; price: number; variantName: string } | null> {
  try {
    const requested = parseLineAttributes(line.lineAttributes);
    const info = line.variantId ? (await variantInfo([line.variantId])).get(String(line.variantId)) : undefined;
    if (!info) {
      if (requested) throw new LineAttributesError("This product takes no options of that kind");
      return null;
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
 * The unit price of each day-priced eSIM line, keyed by the line object, for
 * the checkout re-pricing to use instead of the variant's price. Lines not
 * in the map are priced as Storify prices them.
 *
 * Each such line's `lineAttributes` is settled in place: the days are kept
 * within the variant's range (it can change while a cart waits), and a line
 * whose variant is no longer day-priced loses them — so the order is written
 * with the days it was charged for.
 */
export async function esimLinePrices<T extends { variantId?: unknown; lineAttributes?: unknown }>(
  items: readonly T[],
): Promise<Map<T, number>> {
  const prices = new Map<T, number>();
  const info = await variantInfo(items.map((item) => item.variantId));
  if (!info.size) return prices;
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
