import { mongoose } from "@/lib/db";

const { Schema, models, model } = mongoose;

/**
 * One paid top-up (TOP-04..07): an order line whose `lineAttributes.topup`
 * named a quote, carried out at the eSIM's own supplier.
 *
 * States (the spec's 已支付 → 处理中 → 完成 / 失败):
 *   queued → processing → completed
 *   processing → queued (retry, same key) | processing with a supplier id (poll)
 *   refused, the quote gone, or an answer unknowable after the retries → failed
 *
 * There is no failover: only the supplier that issued the eSIM can top it
 * up. The idempotency key is `provider-topup:{id}` for every attempt, so a
 * retry can never top up twice. A failed top-up is refunded like a failed
 * eSIM (store credit; a person for anything else) — `refund` has the same
 * meaning as on `EsimFulfillment`.
 */
export type TopupState = "queued" | "processing" | "completed" | "failed";

export interface IEsimTopup extends mongoose.Document {
  order: mongoose.Types.ObjectId;
  orderNumber: string;
  lineIndex: number;
  quote: mongoose.Types.ObjectId;
  customer: mongoose.Types.ObjectId | null;
  esim: mongoose.Types.ObjectId | null;
  iccid: string | null;
  plan: mongoose.Types.ObjectId | null;
  providerCode: string;
  topupPlanId: string;
  name: string;
  megabytes: number;
  validityDays: number;
  mode: "stack" | "addon";
  /** What the shopper paid for it, in cents. */
  priceMinor: number;
  cost: { currency: string; amountMinor: number };
  /** The cost in USD cents at the rate of the day it was paid (ORD-04); null when no rate was known. */
  costUsdMinor: number | null;
  state: TopupState;
  attempts: number;
  /** Uncertain answers in a row, for the retry policy. */
  candidateAttempts: number;
  providerTopupId: string | null;
  nextAttemptAt: Date;
  lease: { owner: string; until: Date } | null;
  pendingSince: Date | null;
  lastError: { code: string; message: string; at: Date } | null;
  history: Array<{ at: Date; event: string; detail?: string }>;
  completedAt: Date | null;
  /** The shopper was emailed the outcome. */
  notifiedAt: Date | null;
  refund: {
    state: "pending" | "done" | "manual";
    amount: number;
    at: Date;
    note?: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

const EsimTopupSchema = new Schema<IEsimTopup>(
  {
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    orderNumber: { type: String, required: true },
    lineIndex: { type: Number, required: true, min: 0 },
    quote: { type: Schema.Types.ObjectId, ref: "EsimTopupQuote", required: true },
    customer: { type: Schema.Types.ObjectId, ref: "User", default: null },
    esim: { type: Schema.Types.ObjectId, ref: "EsimProfile", default: null },
    iccid: { type: String, default: null },
    plan: { type: Schema.Types.ObjectId, ref: "EsimPlan", default: null },
    providerCode: { type: String, default: "" },
    topupPlanId: { type: String, default: "" },
    name: { type: String, default: "" },
    megabytes: { type: Number, default: 0 },
    validityDays: { type: Number, default: 0 },
    mode: { type: String, enum: ["stack", "addon"], default: "stack" },
    priceMinor: { type: Number, default: 0, min: 0 },
    cost: {
      currency: { type: String, default: "USD" },
      amountMinor: { type: Number, default: 0 },
    },
    costUsdMinor: { type: Number, default: null },
    state: { type: String, enum: ["queued", "processing", "completed", "failed"], default: "queued" },
    attempts: { type: Number, default: 0 },
    candidateAttempts: { type: Number, default: 0 },
    providerTopupId: { type: String, default: null },
    nextAttemptAt: { type: Date, required: true },
    lease: {
      type: new Schema({ owner: String, until: Date }, { _id: false }),
      default: null,
    },
    pendingSince: { type: Date, default: null },
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
          amount: { type: Number, required: true, min: 0 },
          at: { type: Date, required: true },
          note: { type: String, maxlength: 500 },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
);

EsimTopupSchema.index({ order: 1, lineIndex: 1 }, { unique: true });
EsimTopupSchema.index({ state: 1, nextAttemptAt: 1 });
EsimTopupSchema.index({ esim: 1, createdAt: -1 });
EsimTopupSchema.index({ customer: 1, createdAt: -1 });

if (models.EsimTopup) delete models.EsimTopup;
export const EsimTopup = model<IEsimTopup>("EsimTopup", EsimTopupSchema);
