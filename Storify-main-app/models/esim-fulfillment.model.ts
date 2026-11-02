import { mongoose } from "@/lib/db";

const { Schema, models, model } = mongoose;

/**
 * Buying one eSIM for one unit of a paid order line (ORD-05..09).
 *
 * States:
 *   queued → purchasing → provider_pending → fulfilled
 *   purchasing/provider_pending → queued (retry, same supplier, same key)
 *   rejected by a supplier → queued on the next candidate (failover)
 *   no candidate left, or a supplier's answer unknowable → failed (needs a person)
 *   review (ORD-13): held before anything is bought → queued (approved) | failed (rejected)
 *
 * Each candidate gets its own idempotency key, derived from this job and the
 * plan, so a retry against the same supplier can never buy twice, and a
 * failover to another supplier is a fresh, separate purchase. A job never
 * fails over after an `uncertain` error: the supplier may have sold the eSIM.
 */
export type FulfillmentState = "review" | "queued" | "purchasing" | "provider_pending" | "fulfilled" | "failed";

export interface IEsimFulfillment extends mongoose.Document {
  order: mongoose.Types.ObjectId;
  orderNumber: string;
  lineIndex: number;
  unit: number;
  variantId: mongoose.Types.ObjectId;
  candidates: mongoose.Types.ObjectId[];
  /** The days a day-priced line was charged for; null for a fixed plan. */
  durationDays: number | null;
  /** The day the shopper asked the plan to start (YYYY-MM-DD, ORD-03); null = as the plan does. */
  activationDate: string | null;
  candidateIndex: number;
  state: FulfillmentState;
  attempts: number;
  /** Attempts on the current candidate. */
  candidateAttempts: number;
  providerCode: string | null;
  providerOrderId: string | null;
  profile: mongoose.Types.ObjectId | null;
  nextAttemptAt: Date;
  lease: { owner: string; until: Date } | null;
  /** First time a supplier said "processing" for this candidate. */
  pendingSince: Date | null;
  /**
   * Every supplier refused for want of balance: the job waits for a top-up
   * and tries them all again each round, from `since`, for up to a day.
   * `rounds` keeps each round's purchase key fresh. Null otherwise.
   */
  balanceHold: { since: Date; rounds: number } | null;
  lastError: { code: string; message: string; at: Date } | null;
  history: Array<{ at: Date; event: string; detail?: string }>;
  deliveredAt: Date | null;
  /** Why the order was held for review (ORD-13), and what a person decided. */
  review: {
    reasons: string[];
    heldAt: Date;
    decision: "approved" | "rejected" | null;
    decidedAt: Date | null;
    decidedBy: string | null;
  } | null;
  /**
   * What became of the shopper's money for a failed job (ORD-09).
   * pending: claimed by a refund in progress; done: credited; manual: a
   * person has to refund it (a guest order, or the credit could not be given).
   */
  refund: {
    state: "pending" | "done" | "manual";
    amount: number;
    at: Date;
    note?: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

const EsimFulfillmentSchema = new Schema<IEsimFulfillment>(
  {
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    orderNumber: { type: String, required: true },
    lineIndex: { type: Number, required: true, min: 0 },
    unit: { type: Number, required: true, min: 1 },
    variantId: { type: Schema.Types.ObjectId, required: true },
    candidates: { type: [Schema.Types.ObjectId], ref: "EsimPlan", required: true },
    durationDays: { type: Number, default: null, min: 1 },
    activationDate: { type: String, default: null, maxlength: 10 },
    candidateIndex: { type: Number, default: 0 },
    state: {
      type: String,
      enum: ["review", "queued", "purchasing", "provider_pending", "fulfilled", "failed"],
      default: "queued",
    },
    attempts: { type: Number, default: 0 },
    candidateAttempts: { type: Number, default: 0 },
    providerCode: { type: String, default: null },
    providerOrderId: { type: String, default: null },
    profile: { type: Schema.Types.ObjectId, ref: "EsimProfile", default: null },
    nextAttemptAt: { type: Date, required: true },
    lease: {
      type: new Schema({ owner: String, until: Date }, { _id: false }),
      default: null,
    },
    pendingSince: { type: Date, default: null },
    balanceHold: {
      type: new Schema({ since: { type: Date, required: true }, rounds: { type: Number, default: 0 } }, { _id: false }),
      default: null,
    },
    lastError: {
      type: new Schema({ code: String, message: String, at: Date }, { _id: false }),
      default: null,
    },
    history: {
      type: [new Schema({ at: Date, event: String, detail: String }, { _id: false })],
      default: [],
    },
    deliveredAt: { type: Date, default: null },
    review: {
      type: new Schema(
        {
          reasons: { type: [String], default: [] },
          heldAt: { type: Date, required: true },
          decision: { type: String, enum: ["approved", "rejected", null], default: null },
          decidedAt: { type: Date, default: null },
          decidedBy: { type: String, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
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

EsimFulfillmentSchema.index({ order: 1, lineIndex: 1, unit: 1 }, { unique: true });
EsimFulfillmentSchema.index({ state: 1, nextAttemptAt: 1 });

if (models.EsimFulfillment) delete models.EsimFulfillment;
export const EsimFulfillment = model<IEsimFulfillment>("EsimFulfillment", EsimFulfillmentSchema);
