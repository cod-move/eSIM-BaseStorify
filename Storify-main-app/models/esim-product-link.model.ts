import { mongoose } from "@/lib/db";

const { Schema, models, model } = mongoose;

/**
 * Which storefront product and variant each destination and plan bundle was
 * published as (CAT-05/06). The variant's `candidates` are the supplier plans
 * that can fulfil it, primary first — fulfilment reads this to pick a
 * supplier and to fail over to the next.
 */
export interface IEsimProductLink extends mongoose.Document {
  productSlug: string;
  product: mongoose.Types.ObjectId;
  variants: Array<{
    key: string;
    variantId: mongoose.Types.ObjectId;
    name: string;
    priceMinor: number;
    /**
     * Set on a day-priced variant: the buyer picks the days within the range
     * and the line costs `priceMinor` per day (patch point P10).
     */
    perDay: { priceMinor: number; minDays: number; maxDays: number; defaultDays: number } | null;
    candidates: mongoose.Types.ObjectId[];
  }>;
  publishedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const EsimProductLinkSchema = new Schema<IEsimProductLink>(
  {
    productSlug: { type: String, required: true, unique: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true, unique: true },
    variants: {
      type: [
        new Schema(
          {
            key: { type: String, required: true },
            variantId: { type: Schema.Types.ObjectId, required: true },
            name: { type: String, required: true },
            priceMinor: { type: Number, required: true },
            perDay: {
              type: new Schema(
                {
                  priceMinor: { type: Number, required: true, min: 0 },
                  minDays: { type: Number, required: true, min: 1 },
                  maxDays: { type: Number, required: true, min: 1 },
                  defaultDays: { type: Number, required: true, min: 1 },
                },
                { _id: false },
              ),
              default: null,
            },
            candidates: { type: [Schema.Types.ObjectId], ref: "EsimPlan", default: [] },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    publishedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

EsimProductLinkSchema.index({ "variants.variantId": 1 });

if (models.EsimProductLink) {
  delete models.EsimProductLink;
}

export const EsimProductLink = model<IEsimProductLink>("EsimProductLink", EsimProductLinkSchema);
