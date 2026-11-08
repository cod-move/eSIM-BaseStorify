import { mongoose } from "@/lib/db";
import type { NumberOpTransfer } from "@/models/esim-number-op.model";

const { Schema, models, model } = mongoose;

/**
 * Credit a shopper moves from one of their number cards to another (the
 * live store's "Transfer balance"). Nothing is paid: TopConnect's `sbalance`
 * takes the amount off the source card onto the dealer account (`debit`),
 * then puts it on the target card (`credit`); a refused credit puts it back
 * on the source (`refund`). Each leg keeps its sequential order id before
 * it is sent, as number operations do (lib/esim/numbers/op-policy.ts), so a
 * retry never moves money twice.
 *
 *   queued → processing → completed
 *   debit refused → failed (nothing moved)
 *   credit refused → refund → failed (back on the source)
 *   an answer that cannot be settled → manual (a person checks TopConnect)
 */
export type NumberTransferState = "queued" | "processing" | "completed" | "failed" | "manual";

export interface IEsimNumberTransfer extends mongoose.Document {
  customer: mongoose.Types.ObjectId;
  /** The shopper's idempotency key: one transfer per key. */
  key: string;
  from: { number: mongoose.Types.ObjectId; msisdn: string };
  to: { number: mongoose.Types.ObjectId; msisdn: string };
  /** Cents of `currency` (the cards'). */
  amountMinor: number;
  currency: string;
  state: NumberTransferState;
  debit: NumberOpTransfer;
  credit: NumberOpTransfer;
  refund: NumberOpTransfer | null;
  nextAttemptAt: Date;
  lastError: { code: string; message: string; at: Date } | null;
  history: Array<{ at: Date; event: string; detail?: string }>;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const LegSchema = new Schema(
  {
    orderId: { type: Number, default: null },
    tries: { type: Number, default: 0 },
    done: { type: Boolean, default: false },
    at: { type: Date, default: null },
  },
  { _id: false },
);

const CardSchema = new Schema(
  { number: { type: Schema.Types.ObjectId, ref: "EsimNumber", required: true }, msisdn: { type: String, required: true } },
  { _id: false },
);

const EsimNumberTransferSchema = new Schema<IEsimNumberTransfer>(
  {
    customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    key: { type: String, required: true },
    from: { type: CardSchema, required: true },
    to: { type: CardSchema, required: true },
    amountMinor: { type: Number, required: true, min: 1, validate: Number.isInteger },
    currency: { type: String, required: true, uppercase: true },
    state: { type: String, enum: ["queued", "processing", "completed", "failed", "manual"], default: "queued" },
    debit: { type: LegSchema, default: () => ({}) },
    credit: { type: LegSchema, default: () => ({}) },
    refund: { type: LegSchema, default: null },
    nextAttemptAt: { type: Date, required: true },
    lastError: { type: new Schema({ code: String, message: String, at: Date }, { _id: false }), default: null },
    history: { type: [new Schema({ at: Date, event: String, detail: String }, { _id: false })], default: [] },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

EsimNumberTransferSchema.index({ customer: 1, key: 1 }, { unique: true });
EsimNumberTransferSchema.index({ state: 1, nextAttemptAt: 1 });
EsimNumberTransferSchema.index({ "from.number": 1, state: 1 });
EsimNumberTransferSchema.index({ "to.number": 1, state: 1 });

if (models.EsimNumberTransfer) {
  delete models.EsimNumberTransfer;
}

export const EsimNumberTransfer = model<IEsimNumberTransfer>("EsimNumberTransfer", EsimNumberTransferSchema);
