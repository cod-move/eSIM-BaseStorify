import { mongoose } from "@/lib/db";
import type {
  BillingStart,
  CoverageScope,
  DataType,
  TopupRule,
} from "@/lib/esim/providers/types";

const { Schema, models, model } = mongoose;

/**
 * A supplier's plan, normalized to Stellar's structure (see the spec's "数据模型"
 * section). Written only by the catalogue sync from `ProviderPlan`; the
 * platform's own fields (status, retail price, the storefront product it was
 * published to, KYC) are set by admins and never overwritten by a sync.
 *
 * Unique per (provider, providerPlanId). A plan the supplier stops returning
 * is marked `available: false` by a complete sync, never deleted: orders and
 * eSIMs keep pointing at it.
 */
export interface IEsimPlan extends mongoose.Document {
  provider: mongoose.Types.ObjectId;
  providerCode: string;
  providerPlanId: string;
  sku: string | null;
  name: string;
  slug: string;
  productSlug: string;
  destination: string;
  emoji: string | null;
  coverage: {
    scope: CoverageScope;
    countries: Array<{ code: string; name: string }>;
    networks: Array<{ countryCode: string; operator: string; network: string | null }>;
    breakoutIp: string[];
  };
  data: { megabytes: number; label: string; type: DataType };
  fairUse: { highSpeedGbPerDay: number | null; reducedSpeedMbps: number | null } | null;
  validityDays: number;
  duration: { configurable: boolean; defaultDays: number; minDays: number; maxDays: number };
  speed: string[];
  tethering: boolean | null;
  activation: { billingStarts: BillingStart | null; preInstallDays: number | null };
  topup: TopupRule;
  cost: { currency: string; amountMinor: number; billingUnit: "plan" | "day" };
  bundles: Array<{ type: "vpn"; validityDays: number | null }>;
  extras: { voiceMinutes: number; smsCount: number; refundable: boolean; phoneNumberIncluded: boolean };
  additionalInfo: string | null;
  available: boolean;
  providerUpdatedAt: Date | null;
  syncedAt: Date;
  /** Changes whenever a sync sees different supplier data; skips no-op writes. */
  contentHash: string;
  raw: unknown;

  // Platform fields — never written by the sync.
  status: "active" | "disabled";
  /** Selling price in the store currency (USD), minor units; null = not priced yet. */
  retailPriceMinor: number | null;
  /** An admin set retailPriceMinor by hand; re-pricing leaves it alone. */
  retailPriceManual: boolean;
  pricing: {
    costUsdMinor: number;
    usdPerUnit: number;
    ruleId: mongoose.Types.ObjectId | null;
    markupPercent: number;
    marginFloorApplied: boolean;
    pricedAt: Date;
  } | null;
  /** null = follow the provider's default. */
  kycRequired: boolean | null;
  /**
   * Operators fetched on their own for a plan whose catalogue entry has none
   * (CAT-10, `planNetworks`), and when they were last asked for. Kept apart
   * from `coverage` so a catalogue sync never wipes them.
   */
  supplierNetworks: { list: Array<{ countryCode: string; operator: string; network: string | null }>; checkedAt: Date } | null;
  productId: mongoose.Types.ObjectId | null;
  variantId: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const nullableNumber = { type: Number, default: null };

const EsimPlanSchema = new Schema<IEsimPlan>(
  {
    provider: { type: Schema.Types.ObjectId, ref: "EsimProvider", required: true },
    providerCode: { type: String, required: true, index: true },
    providerPlanId: { type: String, required: true, trim: true },
    sku: { type: String, default: null },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    productSlug: { type: String, required: true, trim: true, index: true },
    destination: { type: String, default: "" },
    emoji: { type: String, default: null },
    coverage: {
      scope: { type: String, enum: ["local", "regional", "global"], required: true },
      countries: {
        type: [new Schema({ code: String, name: String }, { _id: false })],
        default: [],
      },
      networks: {
        type: [new Schema({ countryCode: String, operator: String, network: String }, { _id: false })],
        default: [],
      },
      breakoutIp: { type: [String], default: [] },
    },
    data: {
      megabytes: { type: Number, required: true, min: 0 },
      label: { type: String, default: "" },
      type: {
        type: String,
        enum: ["total", "unlimited", "daily_throttled", "daily_cutoff", "lifetime"],
        required: true,
      },
    },
    fairUse: {
      type: new Schema(
        { highSpeedGbPerDay: nullableNumber, reducedSpeedMbps: nullableNumber },
        { _id: false },
      ),
      default: null,
    },
    validityDays: { type: Number, required: true, min: 0 },
    duration: {
      configurable: { type: Boolean, default: false },
      defaultDays: { type: Number, required: true },
      minDays: { type: Number, required: true },
      maxDays: { type: Number, required: true },
    },
    speed: { type: [String], default: [] },
    tethering: { type: Boolean, default: null },
    activation: {
      billingStarts: {
        type: String,
        enum: ["first_connection", "first_installation", "on_purchase", null],
        default: null,
      },
      preInstallDays: nullableNumber,
    },
    topup: {
      supported: { type: Boolean, default: false },
      type: { type: String, default: null },
      mode: { type: String, enum: ["stack", "addon", "none"], default: "none" },
      stackTarget: { type: String, enum: ["data", "days", "data_and_days", null], default: null },
      window: { type: String, enum: ["before_expiry", "while_profile_exists", null], default: null },
      coverage: { type: String, enum: ["same_area", "any_area", null], default: null },
      profileRetentionDays: nullableNumber,
    },
    cost: {
      currency: { type: String, required: true, uppercase: true },
      amountMinor: { type: Number, required: true, min: 0 },
      billingUnit: { type: String, enum: ["plan", "day"], default: "plan" },
    },
    bundles: {
      type: [new Schema({ type: { type: String, enum: ["vpn"] }, validityDays: nullableNumber }, { _id: false })],
      default: [],
    },
    extras: {
      voiceMinutes: { type: Number, default: 0 },
      smsCount: { type: Number, default: 0 },
      refundable: { type: Boolean, default: false },
      phoneNumberIncluded: { type: Boolean, default: false },
    },
    additionalInfo: { type: String, default: null },
    available: { type: Boolean, default: true },
    providerUpdatedAt: { type: Date, default: null },
    syncedAt: { type: Date, required: true },
    contentHash: { type: String, required: true },
    raw: { type: Schema.Types.Mixed, select: false },

    status: { type: String, enum: ["active", "disabled"], default: "disabled" },
    retailPriceMinor: { type: Number, default: null, min: 0 },
    retailPriceManual: { type: Boolean, default: false },
    pricing: {
      type: new Schema(
        {
          costUsdMinor: { type: Number, required: true },
          usdPerUnit: { type: Number, required: true },
          ruleId: { type: Schema.Types.ObjectId, ref: "EsimPricingRule", default: null },
          markupPercent: { type: Number, required: true },
          marginFloorApplied: { type: Boolean, default: false },
          pricedAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    kycRequired: { type: Boolean, default: null },
    supplierNetworks: {
      type: new Schema(
        {
          list: { type: [new Schema({ countryCode: String, operator: String, network: { type: String, default: null } }, { _id: false })], default: [] },
          checkedAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    productId: { type: Schema.Types.ObjectId, ref: "Product", default: null },
    variantId: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);

EsimPlanSchema.index({ provider: 1, providerPlanId: 1 }, { unique: true });
EsimPlanSchema.index({ "coverage.countries.code": 1, status: 1, available: 1 });
EsimPlanSchema.index({ provider: 1, syncedAt: 1 });

if (models.EsimPlan) {
  delete models.EsimPlan;
}

export const EsimPlan = model<IEsimPlan>("EsimPlan", EsimPlanSchema);
