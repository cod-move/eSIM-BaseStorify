import { mongoose } from "@/lib/db";
import type { NumberLineSnapshot } from "@/lib/esim/numbers/line";

const { Schema, models, model } = mongoose;

/**
 * One paid number card (NUM-05): an order line whose `lineAttributes.number`
 * was settled at checkout, carried out by giving the number to the buyer.
 *
 *   queued → fulfilled (the number is the buyer's)
 *   queued → failed (taken by someone else meanwhile, gone, or not the buyer's
 *            hold) — refunded like a failed eSIM; `refund` means the same as
 *            on `EsimFulfillment`
 *
 * `line` is the snapshot the shopper paid for: the first recharge and data
 * package are carried out from it (`recharge` / `packet`, NUM-08/09), never
 * from today's prices.
 */
export type NumberOrderState = "queued" | "fulfilled" | "failed";
export type NumberStepState = "none" | "pending" | "done" | "failed";

export interface IEsimNumberOrder extends mongoose.Document {
  order: mongoose.Types.ObjectId;
  orderNumber: string;
  lineIndex: number;
  customer: mongoose.Types.ObjectId | null;
  number: mongoose.Types.ObjectId | null;
  msisdn: string;
  /** What the shopper paid for the line, in cents. */
  priceMinor: number;
  line: NumberLineSnapshot | null;
  state: NumberOrderState;
  /** The first recharge and data package: none asked, waiting to be made, made, or failed. */
  recharge: NumberStepState;
  packet: NumberStepState;
  lastError: { code: string; message: string; at: Date } | null;
  history: Array<{ at: Date; event: string; detail?: string }>;
  fulfilledAt: Date | null;
  deliveredAt: Date | null;
  refund: { state: "pending" | "done" | "manual"; amount: number; at: Date; note?: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

const EsimNumberOrderSchema = new Schema<IEsimNumberOrder>(
  {
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    orderNumber: { type: String, required: true },
    lineIndex: { type: Number, required: true, min: 0 },
    customer: { type: Schema.Types.ObjectId, ref: "User", default: null },
    number: { type: Schema.Types.ObjectId, ref: "EsimNumber", default: null },
    msisdn: { type: String, default: "" },
    priceMinor: { type: Number, default: 0, min: 0 },
    line: { type: Schema.Types.Mixed, default: null },
    state: { type: String, enum: ["queued", "fulfilled", "failed"], default: "queued", index: true },
    recharge: { type: String, enum: ["none", "pending", "done", "failed"], default: "none" },
    packet: { type: String, enum: ["none", "pending", "done", "failed"], default: "none" },
    lastError: {
      type: new Schema({ code: String, message: String, at: Date }, { _id: false }),
      default: null,
    },
    history: {
      type: [new Schema({ at: Date, event: String, detail: String }, { _id: false })],
      default: [],
    },
    fulfilledAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
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

EsimNumberOrderSchema.index({ order: 1, lineIndex: 1 }, { unique: true });
EsimNumberOrderSchema.index({ customer: 1, createdAt: -1 });

if (models.EsimNumberOrder) {
  delete models.EsimNumberOrder;
}

export const EsimNumberOrder = model<IEsimNumberOrder>("EsimNumberOrder", EsimNumberOrderSchema);
