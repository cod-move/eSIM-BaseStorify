import { mongoose } from "@/lib/db";
import type { NumberOpTransfer } from "@/models/esim-number-op.model";

const { Schema, models, model } = mongoose;

/**
 * Credit an admin adds to a number card, or takes off it (Admin → eSIM →
 * Numbers → Card credit). Nothing is paid by the shopper: TopConnect's
 * `sbalance` moves the amount from the dealer account onto the card (`add`)
 * or from the card back to the dealer account (`deduct`, a negative amount).
 * The transfer keeps its sequential order id before it is sent, as number
 * operations do (lib/esim/numbers/op-policy.ts), so a retry never moves money
 * twice.
 *
 *   queued → processing → completed
 *   refused → failed (nothing moved)
 *   an answer that cannot be settled → manual (a person checks TopConnect)
 */
export type NumberAdjustmentState = "queued" | "processing" | "completed" | "failed" | "manual";
export type NumberAdjustmentDirection = "add" | "deduct";

export interface IEsimNumberAdjustment extends mongoose.Document {
  /** The admin's idempotency key: one adjustment per key. */
  key: string;
  number: mongoose.Types.ObjectId;
  msisdn: string;
  direction: NumberAdjustmentDirection;
  /** Cents of `currency` (the card's), always positive; `direction` says which way. */
  amountMinor: number;
  currency: string;
  reason: string;
  /** The admin's user id and email. */
  admin: { id: string; email: string | null };
  state: NumberAdjustmentState;
  transfer: NumberOpTransfer;
  /** The card's balance read just before, and after (null when it could not be read). */
  balanceBeforeMinor: number | null;
  balanceAfterMinor: number | null;
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

const EsimNumberAdjustmentSchema = new Schema<IEsimNumberAdjustment>(
  {
    key: { type: String, required: true },
    number: { type: Schema.Types.ObjectId, ref: "EsimNumber", required: true },
    msisdn: { type: String, required: true },
    direction: { type: String, enum: ["add", "deduct"], required: true },
    amountMinor: { type: Number, required: true, min: 1, validate: Number.isInteger },
    currency: { type: String, required: true, uppercase: true },
    reason: { type: String, required: true, maxlength: 500 },
    admin: { type: new Schema({ id: String, email: { type: String, default: null } }, { _id: false }), required: true },
    state: { type: String, enum: ["queued", "processing", "completed", "failed", "manual"], default: "queued" },
    transfer: { type: LegSchema, default: () => ({}) },
    balanceBeforeMinor: { type: Number, default: null },
    balanceAfterMinor: { type: Number, default: null },
    nextAttemptAt: { type: Date, required: true },
    lastError: { type: new Schema({ code: String, message: String, at: Date }, { _id: false }), default: null },
    history: { type: [new Schema({ at: Date, event: String, detail: String }, { _id: false })], default: [] },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

EsimNumberAdjustmentSchema.index({ key: 1 }, { unique: true });
EsimNumberAdjustmentSchema.index({ state: 1, nextAttemptAt: 1 });
EsimNumberAdjustmentSchema.index({ number: 1, createdAt: -1 });

if (models.EsimNumberAdjustment) {
  delete models.EsimNumberAdjustment;
}

export const EsimNumberAdjustment = model<IEsimNumberAdjustment>("EsimNumberAdjustment", EsimNumberAdjustmentSchema);
