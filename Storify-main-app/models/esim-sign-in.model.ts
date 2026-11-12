import { mongoose } from "@/lib/db";

const { Schema, models, model } = mongoose;

/**
 * One sign-in: a session minted for an account (patch P61), kept 180 days.
 * Better Auth's own `session` rows go when the session ends, so they cannot
 * answer "when and from where did this shopper sign in"; this does. Written
 * by lib/esim/account/sign-ins.ts, read on the admin customer page.
 */
export interface IEsimSignIn {
  _id: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  /** Better Auth's session id. */
  sessionId: string | null;
  /** lib/esim/account/sign-ins.ts SignInMethod. */
  method: string;
  /** Better Auth's path that minted it, as it was. */
  path: string | null;
  /** web, shop-app or biz-app (lib/auth/session-audience.ts). */
  client: string | null;
  ip: string | null;
  userAgent: string | null;
  /** The admin who signed in as this shopper (patch P60). */
  impersonatedBy: mongoose.Types.ObjectId | null;
  createdAt: Date;
}

const EsimSignInSchema = new Schema<IEsimSignIn>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    sessionId: { type: String, default: null },
    method: { type: String, required: true },
    path: { type: String, default: null },
    client: { type: String, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    impersonatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

EsimSignInSchema.index({ user: 1, createdAt: -1 });
EsimSignInSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 180 * 24 * 60 * 60 },
);

export const EsimSignIn =
  (models.EsimSignIn as mongoose.Model<IEsimSignIn>) ||
  model<IEsimSignIn>("EsimSignIn", EsimSignInSchema);
