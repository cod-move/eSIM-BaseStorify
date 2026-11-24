import { mongoose } from "@/lib/db";

const { Schema, models, model } = mongoose;

/**
 * Referrals (REF-01..06): a shopper's referral code, who signed up through
 * whose code, and the commission each referred order earns.
 *
 * - EsimReferralCode: one per shopper, made the first time they open the
 *   referral centre; they may change it to a code of their own (REF-01).
 * - EsimReferral: the shopper a code brought in, recorded at sign-up from
 *   the invite cookie (patch P14); valid for commission until `validUntil`.
 * - EsimReferralCommission: one per referred order (REF-02/03/04). Earned
 *   when the order is delivered, paid as store credit after a holding period
 *   unless the order was refunded meanwhile; a refund after payment is left
 *   for a person (`clawback`), since store credit cannot be taken back.
 */

export interface IEsimReferralCode extends mongoose.Document {
  user: mongoose.Types.ObjectId;
  code: string;
  custom: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EsimReferralCodeSchema = new Schema<IEsimReferralCode>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 20 },
    custom: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export interface IEsimReferral extends mongoose.Document {
  referrer: mongoose.Types.ObjectId;
  referee: mongoose.Types.ObjectId;
  code: string;
  /** Commission is earned on the referee's orders until then; null = no end. */
  validUntil: Date | null;
  /** The referee's welcome coupon (REF-06), if one was made. */
  couponCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const EsimReferralSchema = new Schema<IEsimReferral>(
  {
    referrer: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    referee: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    code: { type: String, required: true },
    validUntil: { type: Date, default: null },
    couponCode: { type: String, default: null },
  },
  { timestamps: true },
);

/**
 * A referrer's own rules (REF-07), set by an admin; null fields follow the
 * store-wide referral settings. One per referrer.
 */
export interface IEsimReferralOverride extends mongoose.Document {
  user: mongoose.Types.ObjectId;
  enabled: boolean | null;
  /** "credit" or "data" (二选一); null follows the store. */
  rewardType: "credit" | "data" | null;
  /** Data rewards (MB) and when each is given; null follows the store. */
  referrerMb: number | null;
  referrerOn: "signup" | "first_order" | null;
  inviteeMb: number | null;
  inviteeOn: "signup" | "first_order" | null;
  commissionType: "percent" | "fixed" | null;
  /** Percent, or cents for a fixed commission. */
  commissionValue: number | null;
  validityDays: number | null;
  orderLimit: number | null;
  /** Percent of qualifying orders that earn nothing (扣量). */
  deductPercent: number | null;
  /** Number eSIMs' own rate for this referrer; null follows the store. */
  numbersCommissionType: "percent" | "fixed" | null;
  /** Percent, or cents for a fixed commission. */
  numbersCommissionValue: number | null;
  note: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const EsimReferralOverrideSchema = new Schema<IEsimReferralOverride>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    enabled: { type: Boolean, default: null },
    rewardType: { type: String, enum: ["credit", "data", null], default: null },
    referrerMb: { type: Number, default: null, min: 0, max: 10_000_000 },
    referrerOn: { type: String, enum: ["signup", "first_order", null], default: null },
    inviteeMb: { type: Number, default: null, min: 0, max: 10_000_000 },
    inviteeOn: { type: String, enum: ["signup", "first_order", null], default: null },
    commissionType: { type: String, enum: ["percent", "fixed", null], default: null },
    commissionValue: { type: Number, default: null, min: 0 },
    validityDays: { type: Number, default: null, min: 0 },
    orderLimit: { type: Number, default: null, min: 0 },
    deductPercent: { type: Number, default: null, min: 0, max: 100 },
    numbersCommissionType: { type: String, enum: ["percent", "fixed", null], default: null },
    numbersCommissionValue: { type: Number, default: null, min: 0 },
    note: { type: String, default: null, maxlength: 300 },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

export type CommissionStatus = "pending" | "credited" | "cancelled";

export interface IEsimReferralCommission extends mongoose.Document {
  referral: mongoose.Types.ObjectId;
  referrer: mongoose.Types.ObjectId;
  referee: mongoose.Types.ObjectId;
  order: mongoose.Types.ObjectId;
  orderNumber: string;
  /** What the order paid that earns commission, in currency units, when it was earned. */
  base: number;
  amount: number;
  /** The rate it was earned at (REF-07), so a later refund recomputes it alike; null on older rewards. */
  rule?: {
    commissionType: "percent" | "fixed";
    commissionValue: number;
    /** Number eSIM lines' own rate, when the store set one; absent on rewards earned before. */
    numbers?: { commissionType: "percent" | "fixed"; commissionValue: number } | null;
    /** Number top-ups earned nothing; absent on rewards earned before that rule. */
    skipNumberTopups?: boolean;
  } | null;
  currency: string;
  status: CommissionStatus;
  /** Paid out from then, unless refunded first. */
  payableAt: Date;
  creditedAt: Date | null;
  /** A refund after payment: what should be taken back by hand. */
  clawback: { amount: number; at: Date; settled: boolean } | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const EsimReferralCommissionSchema = new Schema<IEsimReferralCommission>(
  {
    referral: { type: Schema.Types.ObjectId, ref: "EsimReferral", required: true },
    referrer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    referee: { type: Schema.Types.ObjectId, ref: "User", required: true },
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true, unique: true },
    orderNumber: { type: String, required: true },
    base: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    rule: {
      type: new Schema(
        {
          commissionType: { type: String, enum: ["percent", "fixed"] },
          commissionValue: Number,
          numbers: {
            type: new Schema({ commissionType: { type: String, enum: ["percent", "fixed"] }, commissionValue: Number }, { _id: false }),
            default: null,
          },
          skipNumberTopups: { type: Boolean, default: undefined },
        },
        { _id: false },
      ),
      default: null,
    },
    currency: { type: String, default: "USD" },
    status: { type: String, enum: ["pending", "credited", "cancelled"], default: "pending" },
    payableAt: { type: Date, required: true },
    creditedAt: { type: Date, default: null },
    clawback: {
      type: new Schema({ amount: Number, at: Date, settled: { type: Boolean, default: false } }, { _id: false }),
      default: null,
    },
    note: { type: String, default: null, maxlength: 300 },
  },
  { timestamps: true },
);

EsimReferralCommissionSchema.index({ referrer: 1, createdAt: -1 });
EsimReferralCommissionSchema.index({ status: 1, payableAt: 1 });
EsimReferralCommissionSchema.index({ referral: 1, status: 1 });

if (models.EsimReferralCode) delete models.EsimReferralCode;
if (models.EsimReferral) delete models.EsimReferral;
if (models.EsimReferralCommission) delete models.EsimReferralCommission;
if (models.EsimReferralOverride) delete models.EsimReferralOverride;
export const EsimReferralOverride = model<IEsimReferralOverride>("EsimReferralOverride", EsimReferralOverrideSchema);
export const EsimReferralCode = model<IEsimReferralCode>("EsimReferralCode", EsimReferralCodeSchema);
export const EsimReferral = model<IEsimReferral>("EsimReferral", EsimReferralSchema);
export const EsimReferralCommission = model<IEsimReferralCommission>("EsimReferralCommission", EsimReferralCommissionSchema);
