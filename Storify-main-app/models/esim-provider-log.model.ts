import { mongoose } from "@/lib/db";

const { Schema, models, model } = mongoose;

/**
 * One call to a supplier, for troubleshooting and disputes with the supplier.
 *
 * Holds what was asked and what came back, already redacted (activation codes,
 * PINs, tokens and credentials never reach this collection — see
 * `lib/esim/provider-log.ts`). Rows expire after 180 days.
 */
export interface IEsimProviderLog extends mongoose.Document {
  provider: mongoose.Types.ObjectId;
  providerCode: string;
  operation: string;
  ok: boolean;
  durationMs: number;
  errorCode?: string;
  errorMessage?: string;
  refs?: { orderId?: string; esimId?: string; topupId?: string; planId?: string };
  request?: unknown;
  response?: unknown;
  createdAt: Date;
}

const EsimProviderLogSchema = new Schema<IEsimProviderLog>(
  {
    provider: { type: Schema.Types.ObjectId, ref: "EsimProvider", required: true },
    providerCode: { type: String, required: true },
    operation: { type: String, required: true },
    ok: { type: Boolean, required: true },
    durationMs: { type: Number, required: true },
    errorCode: String,
    errorMessage: { type: String, maxlength: 500 },
    refs: {
      orderId: String,
      esimId: String,
      topupId: String,
      planId: String,
    },
    request: Schema.Types.Mixed,
    response: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

EsimProviderLogSchema.index({ provider: 1, createdAt: -1 });
EsimProviderLogSchema.index({ "refs.orderId": 1 }, { sparse: true });
EsimProviderLogSchema.index({ "refs.esimId": 1 }, { sparse: true });
EsimProviderLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

if (models.EsimProviderLog) {
  delete models.EsimProviderLog;
}

export const EsimProviderLog = model<IEsimProviderLog>("EsimProviderLog", EsimProviderLogSchema);
