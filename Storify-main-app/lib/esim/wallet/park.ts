import "server-only";

import { mongoose } from "@/lib/db";
import { Cart } from "@/models";
import { EsimParkedCart } from "@/models/esim-parked-cart.model";
import { findWalletProduct } from "@/lib/esim/wallet/product";

/**
 * Topping up the balance in the middle of a checkout (WAL-01). The top-up is
 * bought on its own, so the cart's other lines are set aside, exactly as
 * stored, and put back when the top-up is credited or the shopper comes back
 * to checkout without it. A line already back in the cart is not doubled.
 */

type Line = { _id?: unknown; productId?: unknown; variantId?: unknown } & Record<string, unknown>;

const keyOf = (line: Line) => `${String(line.productId ?? "")}:${String(line.variantId ?? "")}`;

async function walletVariantId(): Promise<string | null> {
  return (await findWalletProduct())?.variantId ?? null;
}

/** Whether these lines are a wallet top-up's. */
export async function isWalletCart(items: readonly { variantId?: unknown }[]): Promise<boolean> {
  const variantId = await walletVariantId();
  return Boolean(variantId) && items.some((item) => String(item.variantId ?? "") === variantId);
}

/** Sets the cart's lines other than a top-up aside; how many. */
export async function parkCartForTopup(userId: string): Promise<number> {
  const variantId = await walletVariantId();
  const cart = await Cart.findOne({ userId }).select({ items: 1 }).lean<{ _id: unknown; items: Line[] } | null>();
  const others = (cart?.items ?? []).filter((line) => String(line.variantId ?? "") !== variantId);
  if (!cart || !others.length) return 0;
  const parked = await EsimParkedCart.findOne({ user: userId }).select({ items: 1 }).lean<{ items: Line[] } | null>();
  const kept = new Set((parked?.items ?? []).map(keyOf));
  // Set aside before taking out: a failure in between leaves a line in both places, never in neither.
  await EsimParkedCart.updateOne(
    { user: userId },
    { $push: { items: { $each: others.filter((line) => !kept.has(keyOf(line))) } }, $set: { parkedAt: new Date() } },
    { upsert: true },
  );
  await Cart.updateOne({ _id: cart._id }, { $pull: { items: { _id: { $in: others.map((line) => line._id) } } } });
  return others.length;
}

/** How many lines are waiting. */
export async function parkedLineCount(userId: string): Promise<number> {
  const parked = await EsimParkedCart.findOne({ user: userId }).select({ items: 1 }).lean<{ items: Line[] } | null>();
  return parked?.items.length ?? 0;
}

/**
 * Puts the set-aside lines back; how many went back. Not while the cart still
 * holds the top-up, which they would stop from being bought.
 */
export async function restoreParkedCart(userId: string): Promise<number> {
  const parked = await EsimParkedCart.findOne({ user: userId }).lean<{ _id: mongoose.Types.ObjectId; items: Line[]; parkedAt: Date } | null>();
  if (!parked) return 0;
  const variantId = await walletVariantId();
  const cart = await Cart.findOne({ userId }).select({ items: 1 }).lean<{ _id: unknown; items: Line[] } | null>();
  if (cart?.items.some((line) => String(line.variantId ?? "") === variantId)) return 0;
  const present = new Set((cart?.items ?? []).map(keyOf));
  const back = parked.items.filter((line) => !present.has(keyOf(line)));
  if (back.length) {
    if (cart) await Cart.updateOne({ _id: cart._id }, { $push: { items: { $each: back } } });
    else await Cart.create({ userId, items: back });
  }
  // Only the lines read above: a top-up started meanwhile set aside a newer list.
  await EsimParkedCart.deleteOne({ _id: parked._id, parkedAt: parked.parkedAt });
  return back.length;
}
