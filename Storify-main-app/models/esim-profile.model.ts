import { mongoose } from "@/lib/db";
import type { FulfillmentStatus, LifecycleStatus, ProfileStatus } from "@/lib/esim/providers/types";

const { Schema, models, model } = mongoose;

/**
 * A customer's eSIM (the spec's "eSIM 表", Stellar-shaped). Created by the
 * fulfilment worker when a supplier delivers; one per order line unit.
 *
 * `installation.activationCode` is what installs the eSIM — it is shown only
 * to the owner and never written to a log (lib/esim/redact.ts).
 */
export interface IEsimProfile extends mongoose.Document {
  customer: mongoose.Types.ObjectId | null;
  /** Set for guest orders, so the delivery and lookups reach them. */
  email: string | null;
  order: mongoose.Types.ObjectId;
  orderNumber: string;
  lineIndex: number;
  unit: number;
  /** Null only on an eSIM migrated from the old store whose plan the catalogue here has not got (see `legacyPlan`). */
  plan: mongoose.Types.ObjectId | null;
  providerCode: string;
  providerOrderId: string | null;
  providerEsimId: string | null;
  simId: string | null;
  iccid: string | null;
  durationDays: number | null;
  status: FulfillmentStatus;
  usageAvailable: boolean;
  lifecycle: {
    status: LifecycleStatus | null;
    profileStatus: ProfileStatus | null;
    installed: boolean | null;
    installationDetectedAt: Date | null;
    activationDetectedAt: Date | null;
    lastStatusUpdateAt: Date | null;
    lastUsageUpdateAt: Date | null;
  };
  installation: {
    activationCode: string | null;
    smdpAddress: string | null;
    matchingId: string | null;
    qrCodeUrl: string | null;
    apn: string | null;
  };
  customerLink: string | null;
  bundles: Array<{
    type: "vpn";
    status: string | null;
    ready: boolean | null;
    accountNumber: string | null;
    validityDays: number | null;
    expiresAt: Date | null;
  }>;
  usage: {
    totalBytes: number;
    usedBytes: number;
    remainingBytes: number;
    expiresAt: Date | null;
    syncedAt: Date | null;
    stale: boolean | null;
  } | null;
  fulfilledAt: Date | null;
  expiresAt: Date | null;
  /** before_expiry plans: last moment a top-up is accepted. */
  topupDeadline: Date | null;
  /** When the eSIM itself becomes void; null = while a package lives. */
  profileExpiresAt: Date | null;
  activationDeadline: Date | null;
  remark: string | null;
  /**
   * Called off after it was issued (USR-07/08): by the shopper, an admin, or a
   * refund of the order. `state` pending while the supplier is asked;
   * `refundMinor` what went back to the shopper, `feeMinor` what was kept.
   */
  cancellation: {
    state: "pending" | "cancelled" | "refused";
    by: "shopper" | "admin" | "order_refund";
    at: Date;
    refundMinor: number;
    feeMinor: number;
    refund: "balance" | "manual" | "none";
    note: string | null;
  } | null;
  /**
   * Reminders already sent (NTF-03/04/05/07), so each goes out once: the
   * activation notice; low data for the allowance it was measured against
   * (a top-up raises the total and arms it again); expiry and the install
   * deadline for the date they warned about (a new date arms them again).
   */
  reminders: {
    activatedAt: Date | null;
    lowDataForTotal: number | null;
    expiringFor: Date | null;
    installDeadlineFor: Date | null;
  };
  /** When the usage sync (lib/esim/usage) last looked at this eSIM, whatever the answer. */
  usageSyncedAt: Date | null;
  /**
   * The sale as it was (ORD-04), written once when the eSIM is bought: the
   * supplier plan, what the shopper paid for this unit and what the supplier
   * charged, so a later catalogue sync or re-pricing never rewrites history.
   * `cost.usdMinor` is the supplier price at that day's rate, without the
   * pricing buffer; null when no rate was known. Null on eSIMs bought before
   * snapshots existed and on imported ones.
   */
  snapshot: EsimSaleSnapshot | null;
  /**
   * On an eSIM migrated from the old store (MIG): its old plan as the old
   * store described it, shown when `plan` is null. Not a sale: reports never
   * read it.
   */
  legacyPlan: EsimLegacyPlan | null;
  raw: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface EsimLegacyPlan {
  providerPlanId: string;
  name: string;
  validityDays: number;
  megabytes: number;
  dataType: "total" | "unlimited" | "daily_throttled" | "daily_cutoff" | "lifetime";
  label: string;
}

export interface EsimSaleSnapshot {
  providerCode: string;
  providerPlanId: string;
  planName: string;
  destination: string;
  scope: string;
  countries: string[];
  megabytes: number;
  dataType: string;
  validityDays: number;
  durationDays: number | null;
  sale: { currency: string; amountMinor: number };
  cost: { currency: string; amountMinor: number; usdMinor: number | null; usdPerUnit: number | null };
  takenAt: Date;
}

const date = { type: Date, default: null };
const str = { type: String, default: null };

const EsimProfileSchema = new Schema<IEsimProfile>(
  {
    customer: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    email: { type: String, default: null, lowercase: true, trim: true },
    order: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    orderNumber: { type: String, required: true },
    lineIndex: { type: Number, required: true, min: 0 },
    unit: { type: Number, required: true, min: 1 },
    plan: { type: Schema.Types.ObjectId, ref: "EsimPlan", default: null },
    providerCode: { type: String, required: true },
    providerOrderId: str,
    providerEsimId: str,
    simId: str,
    iccid: str,
    durationDays: { type: Number, default: null },
    status: {
      type: String,
      enum: ["pending", "processing", "fulfilled", "failed", "cancelled", "refunded"],
      required: true,
    },
    usageAvailable: { type: Boolean, default: false },
    lifecycle: {
      status: {
        type: String,
        enum: ["not_installed", "installed", "in_use", "depleted", "expired", "cancelled", null],
        default: null,
      },
      profileStatus: {
        type: String,
        enum: ["released", "installed", "enabled", "disabled", "deleted", "unknown", null],
        default: null,
      },
      installed: { type: Boolean, default: null },
      installationDetectedAt: date,
      activationDetectedAt: date,
      lastStatusUpdateAt: date,
      lastUsageUpdateAt: date,
    },
    installation: {
      activationCode: str,
      smdpAddress: str,
      matchingId: str,
      qrCodeUrl: str,
      apn: str,
    },
    customerLink: str,
    bundles: {
      type: [
        new Schema(
          {
            type: { type: String, enum: ["vpn"] },
            status: str,
            ready: { type: Boolean, default: null },
            accountNumber: str,
            validityDays: { type: Number, default: null },
            expiresAt: date,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    usage: {
      type: new Schema(
        {
          totalBytes: Number,
          usedBytes: Number,
          remainingBytes: Number,
          expiresAt: date,
          syncedAt: date,
          stale: { type: Boolean, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    fulfilledAt: date,
    expiresAt: date,
    topupDeadline: date,
    profileExpiresAt: date,
    activationDeadline: date,
    remark: { type: String, default: null, maxlength: 100 },
    cancellation: {
      type: new Schema(
        {
          state: { type: String, enum: ["pending", "cancelled", "refused"], required: true },
          by: { type: String, enum: ["shopper", "admin", "order_refund"], required: true },
          at: { type: Date, required: true },
          refundMinor: { type: Number, default: 0 },
          feeMinor: { type: Number, default: 0 },
          refund: { type: String, enum: ["balance", "manual", "none"], default: "none" },
          note: { type: String, default: null, maxlength: 500 },
        },
        { _id: false },
      ),
      default: null,
    },
    reminders: {
      activatedAt: date,
      lowDataForTotal: { type: Number, default: null },
      expiringFor: date,
      installDeadlineFor: date,
    },
    usageSyncedAt: date,
    snapshot: { type: Schema.Types.Mixed, default: null },
    legacyPlan: { type: Schema.Types.Mixed, default: null },
    raw: { type: Schema.Types.Mixed, select: false },
  },
  { timestamps: true },
);

EsimProfileSchema.index({ order: 1, lineIndex: 1, unit: 1 }, { unique: true });
EsimProfileSchema.index({ iccid: 1 }, { sparse: true });
EsimProfileSchema.index({ simId: 1 }, { sparse: true });
EsimProfileSchema.index({ email: 1 }, { sparse: true });
EsimProfileSchema.index({ status: 1, usageSyncedAt: 1 });
EsimProfileSchema.index({ fulfilledAt: -1 });

if (models.EsimProfile) delete models.EsimProfile;
export const EsimProfile = model<IEsimProfile>("EsimProfile", EsimProfileSchema);
