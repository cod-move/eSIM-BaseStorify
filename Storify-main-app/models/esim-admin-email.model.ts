import { mongoose } from "@/lib/db";

const { Schema, models, model } = mongoose;

/**
 * An email an admin wrote to one customer by hand (Admin → Customers → Send
 * email). Kept here because Storify's outbox (`EmailDelivery`) forgets its
 * rows after 90 days; `job` points at the outbox row while it lasts, for the
 * delivery status. `requestKey` (customer profile + one id per opening of the
 * dialog) is unique, so a double click sends once. Written by
 * lib/esim/admin/customer-email.ts.
 */
export interface IEsimAdminEmail {
  _id: mongoose.Types.ObjectId;
  /** The CustomerProfile the admin wrote from. */
  profile: mongoose.Types.ObjectId;
  /** The account, when the customer has one. */
  user: mongoose.Types.ObjectId | null;
  requestKey: string;
  to: string;
  subject: string;
  message: string;
  /** The outbox row (`EmailDelivery`), when one was made. */
  job: mongoose.Types.ObjectId | null;
  /** What the outbox said when the admin pressed Send. */
  status: string;
  error: string | null;
  sentBy: mongoose.Types.ObjectId | null;
  sentByEmail: string | null;
  createdAt: Date;
}

const EsimAdminEmailSchema = new Schema<IEsimAdminEmail>(
  {
    profile: { type: Schema.Types.ObjectId, ref: "CustomerProfile", required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", default: null },
    requestKey: { type: String, required: true },
    to: { type: String, required: true },
    subject: { type: String, required: true, maxlength: 500 },
    message: { type: String, required: true, maxlength: 20_000 },
    job: { type: Schema.Types.ObjectId, default: null },
    status: { type: String, required: true },
    error: { type: String, default: null, maxlength: 1000 },
    sentBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    sentByEmail: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

EsimAdminEmailSchema.index({ requestKey: 1 }, { unique: true });
EsimAdminEmailSchema.index({ profile: 1, createdAt: -1 });

export const EsimAdminEmail =
  (models.EsimAdminEmail as mongoose.Model<IEsimAdminEmail> | undefined) ??
  model<IEsimAdminEmail>("EsimAdminEmail", EsimAdminEmailSchema);
