import "server-only";

import { mongoose } from "@/lib/db";
import { Order } from "@/models";
import { StoreCreditTransaction } from "@/models/store-credit.model";
import { partsOf, rowKinds, type CreditKind, type CreditPart } from "@/lib/esim/wallet/credit-parts";

/**
 * The shopper's store credit page (patch P38): the balance split into what
 * they topped up, what the store gave and refunds (lib/esim/wallet/credit-parts.ts),
 * and the history with each row's order number and part.
 */

/** Each row with the number of the order it was spent on, refunded from or bought with. */
export async function withOrderNumbers<T extends { orderId?: unknown }>(rows: T[]): Promise<Array<T & { orderNumber: string | null }>> {
  const ids = [...new Set(rows.map((row) => String(row.orderId ?? "")).filter((id) => mongoose.isValidObjectId(id)))];
  const orders = ids.length
    ? await Order.find({ _id: { $in: ids } }).select({ orderNumber: 1 }).lean<Array<{ _id: unknown; orderNumber?: string }>>()
    : [];
  const numbers = new Map(orders.map((order) => [String(order._id), order.orderNumber ?? null]));
  return rows.map((row) => ({ ...row, orderNumber: numbers.get(String(row.orderId ?? "")) ?? null }));
}

type Row = { _id: unknown; type: string; amount: number; currency: string; source?: string | null };

/** Each row with the parts it added to or took from: "Topped up", "Gift", "Refund". */
export async function withCreditKinds<T extends Row>(rows: T[]): Promise<Array<T & { kinds: Array<{ kind: CreditKind; amount: number }> }>> {
  const moving = rows.filter((row) => row.type !== "issue").map((row) => row._id);
  const spends = moving.length
    ? await StoreCreditTransaction.find({ _id: { $in: moving } }).select({ lots: 1 }).lean<Array<{ _id: unknown; lots?: Array<{ lotId: unknown; amount: number }> }>>()
    : [];
  const lotsOf = new Map(spends.map((spend) => [String(spend._id), spend.lots ?? []]));
  const lotIds = [...new Set(spends.flatMap((spend) => (spend.lots ?? []).map((lot) => String(lot.lotId))))];
  const sources = lotIds.length
    ? await StoreCreditTransaction.find({ _id: { $in: lotIds } }).select({ source: 1 }).lean<Array<{ _id: unknown; source: string }>>()
    : [];
  const lotSource = new Map(sources.map((lot) => [String(lot._id), lot.source]));
  return rows.map((row) => ({ ...row, kinds: rowKinds({ ...row, lots: lotsOf.get(String(row._id)) }, lotSource, row.currency) }));
}

/** The balance in each currency, split into parts. */
export async function creditParts(customerId: string, now = new Date()): Promise<Map<string, CreditPart[]>> {
  if (!mongoose.isValidObjectId(customerId)) return new Map();
  const lots = await StoreCreditTransaction.find({
    customerId: new mongoose.Types.ObjectId(customerId),
    type: "issue",
    remaining: { $gt: 0 },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  })
    .select({ currency: 1, source: 1, remaining: 1, expiresAt: 1 })
    .lean<Array<{ currency: string; source: string; remaining: number; expiresAt?: Date | null }>>();
  const byCurrency = new Map<string, typeof lots>();
  for (const lot of lots) byCurrency.set(lot.currency, [...(byCurrency.get(lot.currency) ?? []), lot]);
  return new Map([...byCurrency].map(([currency, list]) => [currency, partsOf(list, currency)]));
}

/** The balances Storify reads, each with its parts. */
export async function withCreditParts<T extends { currency: string }>(customerId: string, balances: T[]): Promise<Array<T & { parts: CreditPart[] }>> {
  const parts = await creditParts(customerId);
  return balances.map((balance) => ({ ...balance, parts: parts.get(balance.currency) ?? [] }));
}
