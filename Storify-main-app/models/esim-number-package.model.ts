import { mongoose } from "@/lib/db";

const { Schema, models, model } = mongoose;

/**
 * A data package for number cards (NUM-02): one of TopConnect's packets
 * (`packetId`, as `discountm … packetid=` takes it), on the price list a
 * number owner picks from.
 *
 * `cost` is TopConnect's price in its own currency: the amount moved onto
 * the card's balance before the packet is switched on (NUM-08). The shopper
 * pays `retailPriceMinor`, in cents of the card currency (TopConnect's
 * settlement currency, like every number price; charged in USD at checkout),
 * priced from the cost like plans are (CAT-07) unless an admin set it by
 * hand. `pricing.currency` is the currency the rules priced it in: a row
 * priced before prices moved to the card currency has none and is priced
 * again. `volumeMb` null is unlimited;
 * `countryCodes` is where the packet works, shown to the shopper only.
 */

export type EsimNumberPackageStatus = "active" | "hidden";

export interface IEsimNumberPackage extends mongoose.Document {
  providerCode: string;
  packetId: string;
  name: string;
  validityDays: number;
  volumeMb: number | null;
  incrementStepKb: number;
  cost: { amountMinor: number; currency: string };
  countryCodes: string[];
  retailPriceMinor: number;
  retailPriceManual: boolean;
  pricing?: {
    costUsdMinor: number;
    usdPerUnit: number;
    currency?: string | null;
    ruleId: mongoose.Types.ObjectId | null;
    markupPercent: number;
    marginFloorApplied: boolean;
    pricedAt: Date;
  } | null;
  status: EsimNumberPackageStatus;
  sortOrder: number;
  legacyId?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const EsimNumberPackageSchema = new Schema<IEsimNumberPackage>(
  {
    providerCode: { type: String, required: true, default: "topconnect" },
    packetId: { type: String, required: true, match: /^\d{1,9}$/ },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    validityDays: { type: Number, required: true, min: 0, validate: Number.isInteger },
    volumeMb: { type: Number, default: null, min: 0 },
    incrementStepKb: { type: Number, default: 1, min: 1, validate: Number.isInteger },
    cost: {
      type: new Schema(
        {
          amountMinor: { type: Number, required: true, min: 0, validate: Number.isInteger },
          currency: { type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ },
        },
        { _id: false },
      ),
      required: true,
    },
    countryCodes: { type: [String], default: [] },
    retailPriceMinor: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    retailPriceManual: { type: Boolean, default: false },
    pricing: {
      type: new Schema(
        {
          costUsdMinor: { type: Number, required: true },
          usdPerUnit: { type: Number, required: true },
          currency: { type: String, default: null },
          ruleId: { type: Schema.Types.ObjectId, default: null },
          markupPercent: { type: Number, required: true },
          marginFloorApplied: { type: Boolean, default: false },
          pricedAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    status: { type: String, enum: ["active", "hidden"], default: "hidden", index: true },
    sortOrder: { type: Number, default: 0 },
    legacyId: { type: Number, default: null, sparse: true },
  },
  { timestamps: true },
);

EsimNumberPackageSchema.index({ providerCode: 1, packetId: 1 }, { unique: true });

if (models.EsimNumberPackage) {
  delete models.EsimNumberPackage;
}

export const EsimNumberPackage = model<IEsimNumberPackage>("EsimNumberPackage", EsimNumberPackageSchema);
