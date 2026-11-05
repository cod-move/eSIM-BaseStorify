import { mongoose } from "@/lib/db";

const { Schema, models, model } = mongoose;

/**
 * What an admin decides about a destination (ADM-02), keyed by the
 * catalogue's product slug. Everything else about a destination — its plans,
 * coverage, product — is derived; only these choices are stored.
 *
 * `names`: the destination's name by language, where an admin gave one
 * (shown instead of the supplier's English name, lib/esim/storefront/destination-name.ts).
 *
 * `pins`: per variant key, the plan an admin chose as primary (ADM-06).
 * Publishing puts it first among the variant's candidates — its price is
 * the variant's, and fulfilment tries it first — while it is still on sale.
 */
export interface IEsimDestination extends mongoose.Document {
  productSlug: string;
  featured: boolean;
  names: Map<string, string>;
  pins: Map<string, mongoose.Types.ObjectId>;
  createdAt: Date;
  updatedAt: Date;
}

const EsimDestinationSchema = new Schema<IEsimDestination>(
  {
    productSlug: { type: String, required: true, unique: true, trim: true },
    featured: { type: Boolean, default: false, index: true },
    names: { type: Map, of: String, default: undefined },
    pins: { type: Map, of: Schema.Types.ObjectId, default: () => new Map() },
  },
  { timestamps: true },
);

if (models.EsimDestination) {
  delete models.EsimDestination;
}

export const EsimDestination = model<IEsimDestination>("EsimDestination", EsimDestinationSchema);
