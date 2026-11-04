import "server-only";

import { mongoose } from "@/lib/db";
import { ORDER_STATUS, PAYMENT_STATUS } from "@/config/app.config";
import { Order } from "@/models";
import { EsimNumber } from "@/models/esim-number.model";
import { EsimNumberPackage } from "@/models/esim-number-package.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { getEsimSettings } from "@/models/esim-pricing.model";
import { rechargeMinOf } from "@/lib/esim/numbers/settings";
import { currentRates } from "@/lib/esim/pricing/fx-service";
import { findNumberTopupProduct } from "@/lib/esim/numbers/product";
import { formatAmount, rechargeProblem, rechargeUsdMinor } from "@/lib/esim/numbers/line";
import { enqueue, type QueuedOp } from "@/lib/esim/numbers/ops";
import type { NumberTopupChoice, NumberTopupSnapshot } from "@/lib/esim/numbers/topup-choice";

/**
 * Credit or a data package for a number the shopper owns (NUM-08/09), bought
 * from the number's page through the normal cart and checkout: an order is
 * made and paid first, and TopConnect is called only after the payment
 * (lib/esim/numbers/ops.ts). The line carries `lineAttributes.numberTopup`:
 * the number and either a recharge (whole amounts in the card's currency,
 * priced at the rate plus the FX buffer) or a package from the price list.
 * Checkout settles it to the snapshot the order keeps.
 */

export type { NumberTopupChoice, NumberTopupSnapshot };

export interface NumberTopupLine {
  lineAttributes: { numberTopup: NumberTopupSnapshot; label: string };
  priceMinor: number;
  label: string;
}

/** The line's priced snapshot, or why it cannot be bought. */
export async function numberTopupLine(choice: NumberTopupChoice | undefined, userId: string | undefined): Promise<NumberTopupLine | string> {
  if (!userId || !mongoose.isValidObjectId(userId)) return "Sign in to the account that owns the number";
  if (!choice?.number || !mongoose.isValidObjectId(choice.number)) return "Choose the number to top up from its page";
  const number = await EsimNumber.findOne({ _id: choice.number, customer: new mongoose.Types.ObjectId(userId), status: "sold" })
    .select({ msisdn: 1, dialCode: 1, nationalNumber: 1 })
    .lean();
  if (!number) return "Sign in to the account that owns the number";
  const title = `+${number.dialCode} ${number.nationalNumber}`;

  if (choice.packet) {
    const row = mongoose.isValidObjectId(choice.packet) ? await EsimNumberPackage.findOne({ _id: choice.packet, status: "active" }).lean() : null;
    if (!row || !(row.retailPriceMinor > 0)) return "This data package is no longer offered: choose another one";
    const label = `${title} · ${row.name}`;
    return {
      lineAttributes: {
        numberTopup: {
          number: String(number._id),
          packet: String(row._id),
          msisdn: number.msisdn,
          kind: "packet",
          amountMinor: row.cost.amountMinor,
          currency: row.cost.currency,
          packetId: row.packetId,
          packetName: row.name,
          priceMinor: row.retailPriceMinor,
        },
        label,
      },
      priceMinor: row.retailPriceMinor,
      label,
    };
  }

  const recharge = choice.recharge ?? 0;
  const settings = await getEsimSettings();
  const problem = recharge ? rechargeProblem(recharge, rechargeMinOf(settings)) : "Choose a whole amount to put on the number";
  if (problem) return problem;
  const provider = await EsimProvider.findOne({ code: "topconnect" }).select({ settlementCurrency: 1 }).lean();
  const currency = provider?.settlementCurrency ?? "EUR";
  const rate = (await currentRates([currency])).get(currency);
  if (!rate) return "Credit cannot be priced right now: try again later";
  const priceMinor = rechargeUsdMinor(recharge, rate.usdPerUnit, settings.fxBufferPercent);
  const label = `${title} · ${formatAmount(recharge, currency)} credit`;
  return {
    lineAttributes: {
      numberTopup: { number: String(number._id), recharge, msisdn: number.msisdn, kind: "recharge", amountMinor: recharge, currency, priceMinor },
      label,
    },
    priceMinor,
    label,
  };
}

type Line = { variantId?: unknown; price?: number; quantity?: number; lineAttributes?: unknown };

/**
 * One operation per top-up line of a paid order, from the line's snapshot.
 * A line whose number is no longer the buyer's, or that was not charged,
 * becomes a failed operation straight away (refunded if it was charged).
 */
export async function enqueueOrderNumberTopups(orderId: unknown): Promise<number> {
  const product = await findNumberTopupProduct();
  if (!product) return 0;
  const order = await Order.findById(orderId)
    .select({ orderNumber: 1, paymentStatus: 1, status: 1, items: 1, customerId: 1, guestEmail: 1 })
    .lean<{ _id: mongoose.Types.ObjectId; orderNumber: string; paymentStatus: string; status: string; items: Line[]; customerId?: unknown; guestEmail?: string | null } | null>();
  if (!order || order.paymentStatus !== PAYMENT_STATUS.PAID || order.status === ORDER_STATUS.CANCELLED) return 0;
  const customer = !order.guestEmail && mongoose.isValidObjectId(order.customerId) ? new mongoose.Types.ObjectId(String(order.customerId)) : null;
  const ops: QueuedOp[] = [];
  const invalid: Array<QueuedOp & { problem: string }> = [];
  for (const [lineIndex, item] of order.items.entries()) {
    if (String(item.variantId ?? "") !== product.variantId) continue;
    const attributes = (item.lineAttributes && typeof item.lineAttributes === "object" ? item.lineAttributes : {}) as { numberTopup?: Partial<NumberTopupSnapshot> };
    const line = attributes.numberTopup;
    const priceMinor = Math.round(Number(item.price || 0) * 100);
    const owned = line?.number && customer && mongoose.isValidObjectId(line.number)
      ? await EsimNumber.exists({ _id: line.number, customer, status: "sold" })
      : null;
    const op: QueuedOp = {
      kind: line?.kind === "packet" ? "packet" : "recharge",
      source: "line",
      number: new mongoose.Types.ObjectId(line?.number && mongoose.isValidObjectId(line.number) ? line.number : undefined),
      msisdn: line?.msisdn ?? "",
      customer,
      order: order._id,
      orderNumber: order.orderNumber,
      lineIndex,
      amountMinor: Number(line?.amountMinor ?? 0),
      currency: line?.currency ?? "EUR",
      packet: line?.kind === "packet" && line.packetId ? { id: line.packet ?? null, packetId: line.packetId, name: line.packetName ?? line.packetId } : null,
      priceMinor,
    };
    const problem = !line?.msisdn || !(op.amountMinor > 0) || (op.kind === "packet" && !op.packet)
      ? "The order line names no top-up"
      : !owned
        ? "The number is not the buyer's"
        : !(priceMinor > 0)
          ? "The line was not charged"
          : null;
    if (problem) invalid.push({ ...op, problem });
    else ops.push(op);
  }
  let added = await enqueue(ops);
  const now = new Date();
  for (const { problem, ...op } of invalid) {
    const { EsimNumberOp } = await import("@/models/esim-number-op.model");
    const result = await EsimNumberOp.updateOne(
      { order: op.order, lineIndex: op.lineIndex, kind: op.kind },
      {
        $setOnInsert: {
          ...op,
          msisdn: op.msisdn || "unknown",
          state: "failed",
          nextAttemptAt: now,
          lastError: { code: "invalid", message: problem, at: now },
          history: [{ at: now, event: "failed", detail: problem }],
          ...(op.priceMinor > 0 ? {} : { refund: { state: "done", amount: 0, at: now, note: "not charged" } }),
        },
      },
      { upsert: true },
    );
    added += result.upsertedCount;
  }
  return added;
}
