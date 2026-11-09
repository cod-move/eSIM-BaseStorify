import { mongoose } from "@/lib/db";

const { Schema, models, model } = mongoose;

/**
 * The import from the old Laravel store (MIG): which old row became which
 * document here. One link per (kind, legacy id) — the unique index is what
 * makes running the import again change nothing.
 *
 * user → User; balance → StoreCreditTransaction; esim → EsimProfile;
 * referral → EsimReferral; order → the per-shopper import Order.
 */
export const LEGACY_LINK_KINDS = ["user", "balance", "esim", "referral", "order", "number"] as const;
export type LegacyLinkKind = (typeof LEGACY_LINK_KINDS)[number];

export interface IEsimLegacyLink extends mongoose.Document {
  kind: LegacyLinkKind;
  legacyId: number;
  targetId: mongoose.Types.ObjectId;
  /** user: matched an account that already existed here (not created). */
  existing: boolean;
  createdAt: Date;
}

const EsimLegacyLinkSchema = new Schema<IEsimLegacyLink>(
  {
    kind: { type: String, enum: LEGACY_LINK_KINDS, required: true },
    legacyId: { type: Number, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    existing: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
EsimLegacyLinkSchema.index({ kind: 1, legacyId: 1 }, { unique: true });

/** One press of "Check" or "Import" on the admin page, and what it found or did. Counts only. */
export interface IEsimLegacyImportRun extends mongoose.Document {
  apply: boolean;
  status: "running" | "done" | "failed";
  startedBy: string;
  startedAt: Date;
  finishedAt: Date | null;
  report: Record<string, number> | null;
  /** Counts by reason, for what was left out ("esim.no-plan:stellar": 3). */
  skipped: Record<string, number> | null;
  error: string | null;
}

const EsimLegacyImportRunSchema = new Schema<IEsimLegacyImportRun>({
  apply: { type: Boolean, required: true },
  status: { type: String, enum: ["running", "done", "failed"], default: "running" },
  startedBy: { type: String, required: true },
  startedAt: { type: Date, required: true },
  finishedAt: { type: Date, default: null },
  report: { type: Schema.Types.Mixed, default: null },
  skipped: { type: Schema.Types.Mixed, default: null },
  error: { type: String, default: null, maxlength: 1000 },
});
EsimLegacyImportRunSchema.index({ startedAt: -1 });

export const EsimLegacyLink =
  (models.EsimLegacyLink as mongoose.Model<IEsimLegacyLink>) || model<IEsimLegacyLink>("EsimLegacyLink", EsimLegacyLinkSchema);

export const EsimLegacyImportRun =
  (models.EsimLegacyImportRun as mongoose.Model<IEsimLegacyImportRun>) ||
  model<IEsimLegacyImportRun>("EsimLegacyImportRun", EsimLegacyImportRunSchema);
