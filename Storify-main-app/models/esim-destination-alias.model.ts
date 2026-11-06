import { mongoose } from "@/lib/db";

const { Schema, models, model } = mongoose;

/**
 * A destination slug that now points at another (lib/esim/catalog/destination-key.ts).
 *
 * - `manual`: an admin merged `from` into `to` (Admin → eSIM → Destinations →
 *   a destination → Merge into). It decides where the plans go.
 * - `auto`: the catalogue found that plans a supplier files under `from` are
 *   for a single country, sold under `to`. A record only.
 *
 * Both keep old addresses working (`/esim/china-mainland` → `/esim/china`)
 * and let the next publish move `from`'s product to `to`, so the product, its
 * status and its reviews carry over.
 */
export interface IEsimDestinationAlias extends mongoose.Document {
  from: string;
  to: string;
  kind: "manual" | "auto";
  createdAt: Date;
  updatedAt: Date;
}

const EsimDestinationAliasSchema = new Schema<IEsimDestinationAlias>(
  {
    from: { type: String, required: true, unique: true, trim: true },
    to: { type: String, required: true, trim: true, index: true },
    kind: { type: String, enum: ["manual", "auto"], required: true },
  },
  { timestamps: true },
);

if (models.EsimDestinationAlias) {
  delete models.EsimDestinationAlias;
}

export const EsimDestinationAlias = model<IEsimDestinationAlias>("EsimDestinationAlias", EsimDestinationAliasSchema);
