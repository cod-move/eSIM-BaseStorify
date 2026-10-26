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
  /** Shopper reminders (NTF-03/04/05/07) and their thresholds. */
  reminders: { enabled: boolean; lowDataPercent: number; expiringHours: number; installDays: number };
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
    reminders: {
      enabled: { type: Boolean, default: true },
      lowDataPercent: { type: Number, default: 20, min: 1, max: 90 },
      expiringHours: { type: Number, default: 24, min: 1, max: 336 },
      installDays: { type: Number, default: 3, min: 1, max: 60 },
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
