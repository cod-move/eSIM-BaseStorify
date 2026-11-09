import { mongoose } from "@/lib/db";

const { Schema, models, model } = mongoose;

/**
 * A picture code that was answered (patch P46), kept until it would have run
 * out anyway, so one picture cannot be answered twice. Only a hash of its id.
 */
export interface IEsimCaptchaUse extends mongoose.Document {
  key: string;
  expiresAt: Date;
}

const EsimCaptchaUseSchema = new Schema<IEsimCaptchaUse>({
  key: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
});

EsimCaptchaUseSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

if (models.EsimCaptchaUse) {
  delete models.EsimCaptchaUse;
}

export const EsimCaptchaUse = model<IEsimCaptchaUse>("EsimCaptchaUse", EsimCaptchaUseSchema);
