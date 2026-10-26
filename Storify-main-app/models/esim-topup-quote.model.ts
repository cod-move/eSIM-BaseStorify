import { mongoose } from "@/lib/db";

const { Schema, models, model } = mongoose;

/**
 * A top-up a shopper picked for one of their eSIMs (TOP-02/03, "已创建"): the
 * supplier's offer as it stood, the eSIM it is for and its cost. The cart
 * line carries only its id (`lineAttributes.topup`, patch P10); checkout
 * prices the line from the cost here, and a paid order copies it into an
 * `EsimTopup` job. Never changed once written; old ones expire on their own.
 */
export interface IEsimTopupQuote extends mongoose.Document {
  customer: mongoose.Types.ObjectId;
  esim: mongoose.Types.ObjectId;
  iccid: string | null;
  /** The eSIM's base plan: its supplier, coverage (for pricing) and top-up rule. */
  plan: mongoose.Types.ObjectId;
  providerCode: string;
  topupPlanId: string;
  name: string;
  megabytes: number;
  validityDays: number;
  mode: "stack" | "addon";
  cost: { currency: string; amountMinor: number };
  createdAt: Date;
  updatedAt: Date;
}

/** Quotes are kept long enough for an order paid late (a bank transfer) to still find its quote. */
export const TOPUP_QUOTE_RETENTION_DAYS = 30;

const EsimTopupQuoteSchema = new Schema<IEsimTopupQuote>(
  {
    customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    esim: { type: Schema.Types.ObjectId, ref: "EsimProfile", required: true },
    iccid: { type: String, default: null },
    plan: { type: Schema.Types.ObjectId, ref: "EsimPlan", required: true },
    providerCode: { type: String, required: true },
    topupPlanId: { type: String, required: true, maxlength: 200 },
    name: { type: String, required: true, maxlength: 200 },
    megabytes: { type: Number, required: true, min: 0 },
    validityDays: { type: Number, required: true, min: 0 },
    mode: { type: String, enum: ["stack", "addon"], required: true },
    cost: {
      currency: { type: String, required: true, uppercase: true },
      amountMinor: { type: Number, required: true, min: 0 },
    },
  },
  { timestamps: true },
);

EsimTopupQuoteSchema.index({ createdAt: 1 }, { expireAfterSeconds: TOPUP_QUOTE_RETENTION_DAYS * 86_400 });
EsimTopupQuoteSchema.index({ customer: 1, esim: 1 });

if (models.EsimTopupQuote) delete models.EsimTopupQuote;
export const EsimTopupQuote = model<IEsimTopupQuote>("EsimTopupQuote", EsimTopupQuoteSchema);
