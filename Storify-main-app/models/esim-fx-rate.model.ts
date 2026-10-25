import { mongoose } from "@/lib/db";

const { Schema, models, model } = mongoose;

/**
 * How many US dollars one unit of a currency is worth (CAT-08). The store
 * settles in USD, so this is the only direction pricing needs.
 *
 * Append-only history: a refresh writes new rows, never edits old ones, so the
 * rate an order was priced at can always be traced. A `manual` row outranks
 * every `ecb` row of the same currency until it is removed.
 */
export interface IEsimFxRate extends mongoose.Document {
  currency: string;
  usdPerUnit: number;
  source: "ecb" | "manual";
  /** The date the source published the rate for. */
  effectiveAt: Date;
  createdBy?: string;
  createdAt: Date;
}

const EsimFxRateSchema = new Schema<IEsimFxRate>(
  {
    currency: { type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ },
    usdPerUnit: { type: Number, required: true, min: 0 },
    source: { type: String, enum: ["ecb", "manual"], required: true },
    effectiveAt: { type: Date, required: true },
    createdBy: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

EsimFxRateSchema.index({ currency: 1, source: 1, effectiveAt: -1 });
EsimFxRateSchema.index({ currency: 1, source: 1, effectiveAt: 1 }, { unique: true });

if (models.EsimFxRate) {
  delete models.EsimFxRate;
}

export const EsimFxRate = model<IEsimFxRate>("EsimFxRate", EsimFxRateSchema);
