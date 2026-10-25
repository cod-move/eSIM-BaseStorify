import { mongoose } from "@/lib/db";

const { Schema, models, model } = mongoose;

/**
 * A package on an eSIM (the spec's EsimPackage). The first purchase creates
 * the `base` package; a stacking top-up updates it in place, an add-on top-up
 * adds a package of its own with its own allowance and validity.
 */
export interface IEsimPackage extends mongoose.Document {
  esim: mongoose.Types.ObjectId;
  plan: mongoose.Types.ObjectId;
  topup: mongoose.Types.ObjectId | null;
  kind: "base" | "stack" | "addon";
  dataTotalBytes: number | null;
  dataRemainingBytes: number | null;
  validityDays: number;
  activatedAt: Date | null;
  expiresAt: Date | null;
  status: "new" | "active" | "depleted" | "expired" | "cancelled";
  createdAt: Date;
  updatedAt: Date;
}

const EsimPackageSchema = new Schema<IEsimPackage>(
  {
    esim: { type: Schema.Types.ObjectId, ref: "EsimProfile", required: true, index: true },
    plan: { type: Schema.Types.ObjectId, ref: "EsimPlan", required: true },
    topup: { type: Schema.Types.ObjectId, default: null },
    kind: { type: String, enum: ["base", "stack", "addon"], required: true },
    dataTotalBytes: { type: Number, default: null },
    dataRemainingBytes: { type: Number, default: null },
    validityDays: { type: Number, required: true },
    activatedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    status: { type: String, enum: ["new", "active", "depleted", "expired", "cancelled"], default: "new" },
  },
  { timestamps: true },
);

EsimPackageSchema.index({ esim: 1, kind: 1 }, { unique: true, partialFilterExpression: { kind: "base" } });

if (models.EsimPackage) delete models.EsimPackage;
export const EsimPackage = model<IEsimPackage>("EsimPackage", EsimPackageSchema);
