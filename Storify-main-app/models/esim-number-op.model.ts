import { mongoose } from "@/lib/db";

const { Schema, models, model } = mongoose;

/**
 * One paid thing done to a number card at TopConnect (NUM-05/08/09): a
 * recharge (money moved onto the card) or a data package (its price moved
 * onto the card, then the packet switched on). Made from a paid order: the
 * first recharge and package bought with the number (`source: "first"`, its
 * number job's snapshot) or a top-up line bought from the number's page
 * (`source: "line"`). Never from today's prices.
 *
 *   queued → processing → completed
 *   refused before any money moved → failed (refunded)
 *   package refused after the transfer → the transfer is moved back → failed (refunded)
 *   an answer that cannot be settled, or a move back that fails → manual (a person; not refunded automatically)
 *
 * Every transfer carries TopConnect's sequential order id (lib/esim/numbers/
 * sequence.ts), kept on the operation before the call: a retry sends the same
 * id, so an unclear answer can never move money twice. `priceMinor` is what
 * the shopper paid for this operation alone; a refund gives back that share.
 */
export type NumberOpKind = "recharge" | "packet";
export type NumberOpState = "queued" | "processing" | "completed" | "failed" | "manual";

export interface NumberOpTransfer {
  orderId: number | null;
  tries: number;
  done: boolean;
  at: Date | null;
}

export interface IEsimNumberOp extends mongoose.Document {
  kind: NumberOpKind;
  source: "first" | "line";
  number: mongoose.Types.ObjectId;
  msisdn: string;
  customer: mongoose.Types.ObjectId | null;
  order: mongoose.Types.ObjectId;
  orderNumber: string;
  lineIndex: number;
  /** Moved onto the card, in cents of `currency` (TopConnect's). */
  amountMinor: number;
  currency: string;
  packet: { id: string | null; packetId: string; name: string } | null;
  /** What the shopper paid for this operation, USD cents. */
  priceMinor: number;
  state: NumberOpState;
  transfer: NumberOpTransfer;
  activation: { tries: number; done: boolean; at: Date | null };
  rollback: NumberOpTransfer | null;
  nextAttemptAt: Date;
  lastError: { code: string; message: string; at: Date } | null;
  history: Array<{ at: Date; event: string; detail?: string }>;
  completedAt: Date | null;
  notifiedAt: Date | null;
  refund: { state: "pending" | "done" | "manual"; amount: number; at: Date; note?: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

const TransferSchema = new Schema(
  {
    orderId: { type: Number, default: null },
    tries: { type: Number, default: 0 },
    done: { type: Boolean, default: false },
    at: { type: Date, default: null },
  },
  { _id: false },
);

const EsimNumberOpSchema = new Schema<IEsimNumberOp>(
  {
    kind: { type: String, enum: ["recharge", "packet"], required: true },
    source: { type: String, enum: ["first", "line"], required: true },
    number: { type: Schema.Types.ObjectId, ref: "EsimNumber", required: true, index: true },
    msisdn: { type: String, required: true },
    customer: { type: Schema.Types.ObjectId, ref: "User", default: null },
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    orderNumber: { type: String, required: true },
    lineIndex: { type: Number, required: true, min: 0 },
    amountMinor: { type: Number, required: true, min: 0, validate: Number.isInteger },
    currency: { type: String, required: true, uppercase: true },
    packet: {
      type: new Schema({ id: { type: String, default: null }, packetId: { type: String, required: true }, name: { type: String, default: "" } }, { _id: false }),
      default: null,
    },
    priceMinor: { type: Number, default: 0, min: 0 },
    state: { type: String, enum: ["queued", "processing", "completed", "failed", "manual"], default: "queued", index: true },
    transfer: { type: TransferSchema, default: () => ({}) },
    activation: {
      type: new Schema({ tries: { type: Number, default: 0 }, done: { type: Boolean, default: false }, at: { type: Date, default: null } }, { _id: false }),
      default: () => ({}),
    },
    rollback: { type: TransferSchema, default: null },
    nextAttemptAt: { type: Date, required: true },
    lastError: {
      type: new Schema({ code: String, message: String, at: Date }, { _id: false }),
      default: null,
    },
    history: {
      type: [new Schema({ at: Date, event: String, detail: String }, { _id: false })],
      default: [],
    },
    completedAt: { type: Date, default: null },
    notifiedAt: { type: Date, default: null },
    refund: {
      type: new Schema(
        {
          state: { type: String, enum: ["pending", "done", "manual"], required: true },
          amount: { type: Number, default: 0 },
          at: { type: Date, required: true },
          note: { type: String },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
);

// One recharge and one package per order line at most.
EsimNumberOpSchema.index({ order: 1, lineIndex: 1, kind: 1 }, { unique: true });
EsimNumberOpSchema.index({ state: 1, nextAttemptAt: 1 });

if (models.EsimNumberOp) {
  delete models.EsimNumberOp;
}

export const EsimNumberOp = model<IEsimNumberOp>("EsimNumberOp", EsimNumberOpSchema);
