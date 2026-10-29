import { mongoose } from "@/lib/db";

const { Schema, models, model } = mongoose;

/**
 * An eSIM campaign (CAT-11): a page at /esim/campaign/<slug> with a banner,
 * its SEO, the destinations on offer and a discount for its dates. The
 * discount is a Storify coupon the campaign keeps in step (`coupon`), limited
 * to the destinations' products: the shopper enters the code at checkout, and
 * Storify's own coupon rules price it. Destinations are by their URL slug.
 */
export interface IEsimCampaign extends mongoose.Document {
  slug: string;
  name: string;
  headline: string;
  description: string;
  imageUrl: string | null;
  seo: { title: string | null; description: string | null };
  destinations: string[];
  discountPercent: number;
  couponCode: string;
  coupon: mongoose.Types.ObjectId | null;
  startsAt: Date;
  endsAt: Date;
  status: "draft" | "active";
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const EsimCampaignSchema = new Schema<IEsimCampaign>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    headline: { type: String, default: "", trim: true, maxlength: 140 },
    description: { type: String, default: "", trim: true, maxlength: 1000 },
    imageUrl: { type: String, default: null },
    seo: {
      title: { type: String, default: null, maxlength: 70 },
      description: { type: String, default: null, maxlength: 320 },
    },
    destinations: { type: [String], default: [] },
    discountPercent: { type: Number, required: true, min: 1, max: 90 },
    couponCode: { type: String, required: true, uppercase: true, trim: true, maxlength: 20 },
    coupon: { type: Schema.Types.ObjectId, ref: "Coupon", default: null },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    status: { type: String, enum: ["draft", "active"], default: "draft" },
    createdBy: { type: String, default: null },
  },
  { timestamps: true },
);

EsimCampaignSchema.index({ status: 1, startsAt: 1, endsAt: 1 });

if (models.EsimCampaign) delete models.EsimCampaign;
export const EsimCampaign = model<IEsimCampaign>("EsimCampaign", EsimCampaignSchema);
