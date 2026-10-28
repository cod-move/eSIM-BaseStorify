import { mongoose } from "@/lib/db";
import type { CoverageScope } from "@/lib/esim/providers/types";
import type { RoundingMode } from "@/lib/esim/pricing/price";

const { Schema, models, model } = mongoose;

/**
 * Pricing policy (CAT-07): one settings document and any number of rules.
 * The arithmetic lives in lib/esim/pricing/price.ts.
 */

export interface IEsimPricingRule extends mongoose.Document {
  providerCode: string | null;
  countryCode: string | null;
  scope: CoverageScope | null;
  markupPercent: number;
  /** USD cents added after the markup. */
  fixedMarkupMinor: number;
  priority: number;
  enabled: boolean;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EsimPricingRuleSchema = new Schema<IEsimPricingRule>(
  {
    providerCode: { type: String, default: null, lowercase: true, trim: true },
    countryCode: { type: String, default: null, uppercase: true, match: /^[A-Z]{2}$/ },
    scope: { type: String, enum: ["local", "regional", "global", null], default: null },
    markupPercent: { type: Number, required: true, min: -100, max: 1000 },
    fixedMarkupMinor: { type: Number, default: 0, min: 0 },
    priority: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
    note: { type: String, maxlength: 200 },
  },
  { timestamps: true },
);

EsimPricingRuleSchema.index(
  { providerCode: 1, countryCode: 1, scope: 1 },
  { unique: true, partialFilterExpression: { enabled: true } },
);

export interface IEsimSettings extends mongoose.Document {
  /** Always "default": there is exactly one. */
  key: string;
  fxBufferPercent: number;
  defaultMarkupPercent: number;
  minMarginPercent: number;
  rounding: RoundingMode;
  /** Re-price automatically when a currency moves more than this since pricing. */
  repriceThresholdPercent: number;
  /** The storefront category eSIM products are filed under. */
  categoryId: mongoose.Types.ObjectId | null;
  /** The hidden store product top-ups are sold as (lib/esim/topup/product.ts). */
  topupProductId: mongoose.Types.ObjectId | null;
  /** The hidden store product wallet top-ups are sold as (lib/esim/wallet/product.ts). */
  walletProductId: mongoose.Types.ObjectId | null;
  /** The hidden store product the old store's eSIMs are listed under on their import order (lib/esim/migration). */
  migratedProductId: mongoose.Types.ObjectId | null;
  /** Wallet top-ups (WAL-01): on/off, the amounts allowed and the fee, in cents and percent. */
  wallet: { enabled: boolean; minMinor: number; maxMinor: number; feeFixedMinor: number; feePercent: number };
  /** Referrals (REF-02/06): see lib/esim/referral/rules.ts for what each setting means. */
  referral: {
    enabled: boolean;
    commissionType: "percent" | "fixed";
    commissionValue: number;
    validityDays: number;
    orderLimit: number;
    holdDays: number;
    coupon: { enabled: boolean; type: "percentage" | "fixed"; value: number; days: number; minOrderMinor: number };
  };
  /** Customer KYC (KYC-03): countries whose plans need it unless a plan says otherwise. */
  kyc: { countries: string[] };
  /** Shopper reminders (NTF-03/04/05/07) and their thresholds. */
  reminders: { enabled: boolean; lowDataPercent: number; expiringHours: number; installDays: number };
  /** Shopper cancellation (USR-07): on/off, the fee kept, where the rest goes. */
  cancellation: { enabled: boolean; feeFixedMinor: number; feePercent: number; refundTo: "balance" | "original" };
  updatedAt: Date;
}

const EsimSettingsSchema = new Schema<IEsimSettings>(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    fxBufferPercent: { type: Number, default: 3, min: 0, max: 50 },
    defaultMarkupPercent: { type: Number, default: 50, min: -100, max: 1000 },
    minMarginPercent: { type: Number, default: 15, min: 0, max: 500 },
    rounding: { type: String, enum: ["none", "99", "49_99"], default: "99" },
    repriceThresholdPercent: { type: Number, default: 2, min: 0, max: 50 },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    topupProductId: { type: Schema.Types.ObjectId, ref: "Product", default: null },
    walletProductId: { type: Schema.Types.ObjectId, ref: "Product", default: null },
    migratedProductId: { type: Schema.Types.ObjectId, ref: "Product", default: null },
    wallet: {
      enabled: { type: Boolean, default: true },
      minMinor: { type: Number, default: 500, min: 100 },
      maxMinor: { type: Number, default: 100_000, min: 100 },
      feeFixedMinor: { type: Number, default: 0, min: 0 },
      feePercent: { type: Number, default: 0, min: 0, max: 50 },
    },
    referral: {
      enabled: { type: Boolean, default: false },
      commissionType: { type: String, enum: ["percent", "fixed"], default: "percent" },
      commissionValue: { type: Number, default: 10, min: 0 },
      validityDays: { type: Number, default: 365, min: 0 },
      orderLimit: { type: Number, default: 0, min: 0 },
      holdDays: { type: Number, default: 14, min: 0, max: 365 },
      coupon: {
        enabled: { type: Boolean, default: false },
        type: { type: String, enum: ["percentage", "fixed"], default: "percentage" },
        value: { type: Number, default: 10, min: 0 },
        days: { type: Number, default: 30, min: 1 },
        minOrderMinor: { type: Number, default: 0, min: 0 },
      },
    },
    kyc: {
      countries: { type: [String], default: [] },
    },
    reminders: {
      enabled: { type: Boolean, default: true },
      lowDataPercent: { type: Number, default: 20, min: 1, max: 90 },
      expiringHours: { type: Number, default: 24, min: 1, max: 336 },
      installDays: { type: Number, default: 3, min: 1, max: 60 },
    },
    cancellation: {
      enabled: { type: Boolean, default: false },
      feeFixedMinor: { type: Number, default: 0, min: 0 },
      feePercent: { type: Number, default: 0, min: 0, max: 100 },
      refundTo: { type: String, enum: ["balance", "original"], default: "balance" },
    },
  },
  { timestamps: true },
);

if (models.EsimPricingRule) delete models.EsimPricingRule;
if (models.EsimSettings) delete models.EsimSettings;

export const EsimPricingRule = model<IEsimPricingRule>("EsimPricingRule", EsimPricingRuleSchema);
export const EsimSettings = model<IEsimSettings>("EsimSettings", EsimSettingsSchema);

export async function getEsimSettings(): Promise<IEsimSettings> {
  return EsimSettings.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { key: "default" } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ) as Promise<IEsimSettings>;
}
