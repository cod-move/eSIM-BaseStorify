import { mongoose } from "@/lib/db";
import type { KycFieldType } from "@/lib/esim/kyc/rules";

const { Schema, models, model } = mongoose;

/**
 * Customer KYC (KYC-01/02).
 *
 * - EsimKycForm: one document per published version of the form; never
 *   changed after it is written. The newest is the one shoppers fill in.
 * - EsimKycSubmission: a shopper's answers to one version, with their files
 *   in private storage (`biz-private/esim-kyc/<user>/…`), and the review.
 *   A shopper's status is their newest submission's.
 */

const FieldSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, enum: ["text", "textarea", "select", "date", "file"], required: true },
    required: { type: Boolean, default: false },
    options: { type: [String], default: [] },
    help: { type: String, default: null },
  },
  { _id: false },
);

export interface IEsimKycForm extends mongoose.Document {
  version: number;
  fields: Array<{ key: string; label: string; type: KycFieldType; required: boolean; options: string[]; help: string | null }>;
  publishedBy: string | null;
  createdAt: Date;
}

const EsimKycFormSchema = new Schema<IEsimKycForm>(
  {
    version: { type: Number, required: true, unique: true, min: 1 },
    fields: { type: [FieldSchema], default: [] },
    publishedBy: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type KycStatus = "pending" | "approved" | "rejected";

export interface IEsimKycSubmission extends mongoose.Document {
  user: mongoose.Types.ObjectId;
  formVersion: number;
  answers: Array<{
    key: string;
    label: string;
    type: KycFieldType;
    value: string | null;
    file: { key: string; name: string; mime: string; size: number } | null;
  }>;
  status: KycStatus;
  reason: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const EsimKycSubmissionSchema = new Schema<IEsimKycSubmission>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    formVersion: { type: Number, required: true },
    answers: {
      type: [
        new Schema(
          {
            key: String,
            label: String,
            type: { type: String },
            value: { type: String, default: null },
            file: { type: new Schema({ key: String, name: String, mime: String, size: Number }, { _id: false }), default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    reason: { type: String, default: null, maxlength: 500 },
    reviewedBy: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

EsimKycSubmissionSchema.index({ user: 1, createdAt: -1 });
EsimKycSubmissionSchema.index({ status: 1, createdAt: 1 });
// One submission waiting for review per shopper.
EsimKycSubmissionSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { status: "pending" } });

/**
 * A document the shopper app uploaded before sending the form (APP-07): the
 * app sends one file per request, so each is stored privately first and the
 * submission names it. Unused ones lapse after a day.
 */
export interface IEsimKycUpload extends mongoose.Document {
  user: mongoose.Types.ObjectId;
  field: string;
  key: string;
  name: string;
  mime: string;
  size: number;
  createdAt: Date;
}

const EsimKycUploadSchema = new Schema<IEsimKycUpload>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    field: { type: String, required: true },
    key: { type: String, required: true },
    name: { type: String, required: true },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
EsimKycUploadSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86_400 });

if (models.EsimKycForm) delete models.EsimKycForm;
if (models.EsimKycSubmission) delete models.EsimKycSubmission;
export const EsimKycForm = model<IEsimKycForm>("EsimKycForm", EsimKycFormSchema);
export const EsimKycSubmission = model<IEsimKycSubmission>("EsimKycSubmission", EsimKycSubmissionSchema);
export const EsimKycUpload = (models.EsimKycUpload as mongoose.Model<IEsimKycUpload>) || model<IEsimKycUpload>("EsimKycUpload", EsimKycUploadSchema);
