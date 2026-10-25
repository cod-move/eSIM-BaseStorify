import { mongoose } from "@/lib/db";
import type { EncryptedSecret } from "@/lib/auth/secret-box";
import type { TopupRule } from "@/lib/esim/providers/types";

const { Schema, models, model } = mongoose;

/**
 * An eSIM supplier account the platform buys from.
 *
 * `code` picks the adapter (lib/esim/providers/registry.ts). Credentials are
 * split: plain values (a base URL, a phone number) in `credentials`, secret
 * ones encrypted in `secretCredentials` and never sent to a client.
 * `topupOverride` corrects a provider's default top-up rule when the supplier
 * confirms a different one than its API implies.
 */
export interface IEsimProvider extends mongoose.Document {
  code: string;
  name: string;
  status: "active" | "disabled";
  /** Currency the supplier bills in; plan costs are stored in it. */
  settlementCurrency: string;
  credentials: Map<string, string>;
  secretCredentials: Map<string, EncryptedSecret>;
  /** Lower wins when several suppliers can fulfil the same variant. */
  priority: number;
  topupOverride?: Partial<TopupRule>;
  /** Plans of this supplier require KYC unless the plan says otherwise. */
  kycRequiredDefault: boolean;
  lastSync?: {
    startedAt: Date;
    finishedAt?: Date;
    status: "running" | "ok" | "failed";
    seen?: number;
    created?: number;
    updated?: number;
    retired?: number;
    error?: string;
  };
  lastProbe?: { at: Date; ok: boolean; message: string };
  createdAt: Date;
  updatedAt: Date;
}

const EncryptedSecretSchema = new Schema(
  {
    version: { type: Number, required: true },
    algorithm: { type: String, required: true },
    iv: { type: String, required: true },
    ciphertext: { type: String, required: true },
    authTag: { type: String, required: true },
  },
  { _id: false },
);

const EsimProviderSchema = new Schema<IEsimProvider>(
  {
    code: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    status: { type: String, enum: ["active", "disabled"], default: "disabled", index: true },
    settlementCurrency: { type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ },
    credentials: { type: Map, of: String, default: {} },
    secretCredentials: { type: Map, of: EncryptedSecretSchema, default: {}, select: false },
    priority: { type: Number, default: 100 },
    topupOverride: { type: Schema.Types.Mixed, default: undefined },
    kycRequiredDefault: { type: Boolean, default: false },
    lastSync: {
      type: new Schema(
        {
          startedAt: { type: Date, required: true },
          finishedAt: Date,
          status: { type: String, enum: ["running", "ok", "failed"], required: true },
          seen: Number,
          created: Number,
          updated: Number,
          retired: Number,
          error: { type: String, maxlength: 500 },
        },
        { _id: false },
      ),
      default: undefined,
    },
    lastProbe: {
      type: new Schema(
        { at: Date, ok: Boolean, message: { type: String, maxlength: 500 } },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: true },
);

if (models.EsimProvider) {
  delete models.EsimProvider;
}

export const EsimProvider = model<IEsimProvider>("EsimProvider", EsimProviderSchema);
