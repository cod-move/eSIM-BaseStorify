import { mongoose } from "@/lib/db";
import type { NumberOpTransfer } from "@/models/esim-number-op.model";

const { Schema, models, model } = mongoose;

/**
 * What a shopper asks for a number card beyond its services, kept as a
 * record (who, when, what became of it):
 *
 * - `qr`: a new QR code (a new eSIM profile) for a lost or broken one.
 *   TopConnect has no command for it, so a person orders it and pastes the
 *   new activation code. The fee is taken off the card's own credit first
 *   (`charge`, an `sbalance` leg with its order id kept before each send, as
 *   number operations do); a refused request puts it back (`refund`).
 *
 *     queued → charging → pending (a person) → completed
 *     charge refused → failed (nothing taken)
 *     rejected by a person → refunding → rejected (fee back on the card)
 *     an answer that cannot be settled → manual
 *
 * - `transfer`: the number moved to another shopper's account (done at once).
 * - `release`: the shopper gave the number up (done at once).
 */
export type NumberRequestKind = "qr" | "transfer" | "release";
export type NumberRequestState = "queued" | "charging" | "pending" | "completed" | "failed" | "refunding" | "rejected" | "manual";

export interface IEsimNumberRequest extends mongoose.Document {
  kind: NumberRequestKind;
  customer: mongoose.Types.ObjectId;
  /** The shopper's idempotency key: one request per key. */
  key: string;
  number: mongoose.Types.ObjectId;
  msisdn: string;
  /** Cents of `currency` (the card's); 0 when free. */
  feeMinor: number;
  currency: string;
  state: NumberRequestState;
  charge: NumberOpTransfer;
  refund: NumberOpTransfer | null;
  /** `transfer`: who the number went to. */
  toCustomer: mongoose.Types.ObjectId | null;
  /** A person's answer: the note shown to the shopper. */
  resolution: { by: mongoose.Types.ObjectId | null; at: Date; note: string | null } | null;
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

const STATES: NumberRequestState[] = ["queued", "charging", "pending", "completed", "failed", "refunding", "rejected", "manual"];

const EsimNumberRequestSchema = new Schema<IEsimNumberRequest>(
  {
    kind: { type: String, enum: ["qr", "transfer", "release"], required: true },
    customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    key: { type: String, required: true },
    number: { type: Schema.Types.ObjectId, ref: "EsimNumber", required: true },
    msisdn: { type: String, required: true },
    feeMinor: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    currency: { type: String, required: true, uppercase: true },
    state: { type: String, enum: STATES, default: "queued" },
    charge: { type: LegSchema, default: () => ({}) },
    refund: { type: LegSchema, default: null },
    toCustomer: { type: Schema.Types.ObjectId, ref: "User", default: null },
    resolution: {
      type: new Schema({ by: { type: Schema.Types.ObjectId, ref: "User", default: null }, at: Date, note: { type: String, default: null, maxlength: 500 } }, { _id: false }),
      default: null,
    },
    nextAttemptAt: { type: Date, required: true },
    lastError: { type: new Schema({ code: String, message: String, at: Date }, { _id: false }), default: null },
    history: { type: [new Schema({ at: Date, event: String, detail: String }, { _id: false })], default: [] },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

EsimNumberRequestSchema.index({ customer: 1, key: 1 }, { unique: true });
EsimNumberRequestSchema.index({ state: 1, nextAttemptAt: 1 });
EsimNumberRequestSchema.index({ number: 1, kind: 1, createdAt: -1 });
EsimNumberRequestSchema.index({ kind: 1, state: 1, createdAt: -1 });

if (models.EsimNumberRequest) {
  delete models.EsimNumberRequest;
}

export const EsimNumberRequest = model<IEsimNumberRequest>("EsimNumberRequest", EsimNumberRequestSchema);
