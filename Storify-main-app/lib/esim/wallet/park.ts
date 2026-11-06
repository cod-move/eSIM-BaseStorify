import "server-only";

import { mongoose } from "@/lib/db";
import { Cart, Order } from "@/models";
import { EsimParkedCart } from "@/models/esim-parked-cart.model";
import { findWalletProduct } from "@/lib/esim/wallet/product";
import { findTopupProduct } from "@/lib/esim/topup/product";
import { findNumberTopupProduct } from "@/lib/esim/numbers/product";
import { findPaymentFeeProduct } from "@/lib/esim/payments/fee-line";
import { mixesTopup } from "@/lib/esim/wallet/mixed";

/**
 * A top-up is checked out on its own: an eSIM's data top-up (TOP-03), a
 * number's credit or data package (NUM-08/09) and money for the balance
 * (WAL-01). Putting one in the cart sets the cart's other lines aside, exactly
 * as stored; they come back when the top-up is paid, when the shopper opens
 * checkout without it, or when they add something else (they went back to
 * shopping, so the top-up they left is dropped). A line already back in the
 * cart is not doubled. Only signed-in shoppers top up, so only their carts.
 */

type Line = { _id?: unknown; productId?: unknown; variantId?: unknown } & Record<string, unknown>;

const keyOf = (line: Line) => `${String(line.productId ?? "")}:${String(line.variantId ?? "")}`;
const variantOf = (line: { variantId?: unknown }) => String(line.variantId ?? "");

async function walletVariantId(): Promise<string | null> {
  return (await findWalletProduct())?.variantId ?? null;
}

/** The variants of the three top-up products that exist. */
async function topupVariantIds(): Promise<Set<string>> {
  const products = await Promise.all([findTopupProduct(), findNumberTopupProduct(), findWalletProduct()]);
  return new Set(products.flatMap((product) => (product?.variantId ? [String(product.variantId)] : [])));
}

/** Whether these lines are a wallet top-up's. */
export async function isWalletCart(items: readonly { variantId?: unknown }[]): Promise<boolean> {
  const variantId = await walletVariantId();
  return Boolean(variantId) && items.some((item) => variantOf(item) === variantId);
}

/** Whether these lines mix a top-up with anything else (lib/esim/wallet/mixed.ts), which checkout refuses. */
export async function isMixedTopupCart(items: readonly { variantId?: unknown }[]): Promise<boolean> {
  const [topups, fee] = await Promise.all([topupVariantIds(), findPaymentFeeProduct()]);
  return mixesTopup(items, topups, fee?.variantId);
}

/**
 * Makes room for the top-up `keepVariantId`: the cart's ordinary lines are set
 * aside, another top-up left there is dropped (it was never bought), and so is
 * a payment fee (checkout adds it again). How many lines were set aside.
 */
export async function parkCartForTopup(userId: string, keepVariantId?: string | null): Promise<number> {
  const [topups, fee] = await Promise.all([topupVariantIds(), findPaymentFeeProduct()]);
  const keep = keepVariantId ?? (await walletVariantId());
  const cart = await Cart.findOne({ userId }).select({ items: 1 }).lean<{ _id: unknown; items: Line[] } | null>();
  const leaving = (cart?.items ?? []).filter((line) => variantOf(line) !== keep);
  const others = leaving.filter((line) => variantOf(line) !== fee?.variantId && !topups.has(variantOf(line)));
  if (!cart || !leaving.length) return 0;
  if (others.length) {
    const parked = await EsimParkedCart.findOne({ user: userId }).select({ items: 1 }).lean<{ items: Line[] } | null>();
    const kept = new Set((parked?.items ?? []).map(keyOf));
    // Set aside before taking out: a failure in between leaves a line in both places, never in neither.
    await EsimParkedCart.updateOne(
      { user: userId },
      { $push: { items: { $each: others.filter((line) => !kept.has(keyOf(line))) } }, $set: { parkedAt: new Date() } },
      { upsert: true },
    );
  }
  await Cart.updateOne({ _id: cart._id }, { $pull: { items: { _id: { $in: leaving.map((line) => line._id) } } } });
  return others.length;
}

/** How many lines are waiting. */
export async function parkedLineCount(userId: string): Promise<number> {
  const parked = await EsimParkedCart.findOne({ user: userId }).select({ items: 1 }).lean<{ items: Line[] } | null>();
  return parked?.items.length ?? 0;
}

/**
 * Puts the set-aside lines back; how many went back. Not while the cart still
 * holds a top-up, which they would stop from being bought.
 */
export async function restoreParkedCart(userId: string): Promise<number> {
  const parked = await EsimParkedCart.findOne({ user: userId }).lean<{ _id: mongoose.Types.ObjectId; items: Line[]; parkedAt: Date } | null>();
  if (!parked) return 0;
  const topups = await topupVariantIds();
  const cart = await Cart.findOne({ userId }).select({ items: 1 }).lean<{ _id: unknown; items: Line[] } | null>();
  if (cart?.items.some((line) => topups.has(variantOf(line)))) return 0;
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

/**
 * Patch P10, before a line goes in the cart: a top-up makes room for itself
 * (`parkCartForTopup`); anything else drops a top-up left in the cart and
 * brings the set-aside lines back. True when the cart was changed, so the
 * caller reads it again. Guests have nothing set aside.
 */
export async function esimKeepTopupAlone(userId: string | undefined, variantId: unknown): Promise<boolean> {
  if (!userId) return false;
  const topups = await topupVariantIds();
  const adding = String(variantId ?? "");
  if (topups.has(adding)) {
    await parkCartForTopup(userId, adding);
    return true;
  }
  const cart = await Cart.findOne({ userId }).select({ items: 1 }).lean<{ _id: unknown; items: Line[] } | null>();
  const left = (cart?.items ?? []).filter((line) => topups.has(variantOf(line)));
  if (cart && left.length) await Cart.updateOne({ _id: cart._id }, { $pull: { items: { _id: { $in: left.map((line) => line._id) } } } });
  return (await restoreParkedCart(userId)) > 0 || left.length > 0;
}

/** A paid order with a top-up: its shopper's set-aside lines go back in the cart. */
export async function restoreAfterTopupOrder(orderId: string): Promise<void> {
  const order = await Order.findById(orderId).select({ customerId: 1, items: 1 }).lean<{ customerId?: unknown; items?: Line[] } | null>();
  if (!order?.customerId || !mongoose.isValidObjectId(String(order.customerId))) return;
  const topups = await topupVariantIds();
  if (!order.items?.some((line) => topups.has(variantOf(line)))) return;
  await restoreParkedCart(String(order.customerId));
}
