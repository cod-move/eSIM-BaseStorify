import { mongoose } from "@/lib/db";

const { Schema, models, model } = mongoose;

/**
 * A number card (NUM-01): a TopConnect eSIM bought in advance, held as stock
 * until a signed-in shopper buys it, then theirs.
 *
 * `msisdn` is the full international number (digits); `dialCode` and
 * `nationalNumber` split it for the "+372 55501234" title and the picker's
 * filter. `install` (LPA, PIN/PUK) is what installs and unlocks the card: it
 * is never selected by default and reaches the owner only after payment
 * (NUM-07). Prices are USD cents: the number's price plus a premium for a
 * memorable one. `card` caches the last `card_stat` answer (NUM-06).
 */

export type EsimNumberStatus = "available" | "reserved" | "sold" | "retired";

export interface IEsimNumber extends mongoose.Document {
  providerCode: string;
  msisdn: string;
  dialCode: string;
  nationalNumber: string;
  country: string | null;
  iccid: string;
  install: {
    lpa: string;
    pin1: string | null;
    puk1: string | null;
    pin2: string | null;
    puk2: string | null;
  };
  priceMinor: number;
  premiumMinor: number;
  status: EsimNumberStatus;
  /** Who it is held for while they pay (NUM-04). */
  reservation?: { customer: mongoose.Types.ObjectId; until: Date; order?: mongoose.Types.ObjectId } | null;
  customer?: mongoose.Types.ObjectId | null;
  order?: mongoose.Types.ObjectId | null;
  soldAt?: Date | null;
  /** Import batch name, for finding a delivery again. */
  batch: string | null;
  note: string | null;
  card?: {
    checkedAt: Date;
    balanceMinor: number | null;
    currency: string | null;
    blocked: boolean | null;
    lastUsedAt: Date | null;
  } | null;
  legacyId?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const EsimNumberSchema = new Schema<IEsimNumber>(
  {
    providerCode: { type: String, required: true, default: "topconnect", index: true },
    msisdn: { type: String, required: true, unique: true, match: /^\d{5,17}$/ },
    dialCode: { type: String, required: true, match: /^\d{1,4}$/, index: true },
    nationalNumber: { type: String, required: true },
    country: { type: String, default: null },
    iccid: { type: String, required: true, unique: true, uppercase: true, match: /^\d{18,22}F?$/ },
    install: {
      type: new Schema(
        {
          lpa: { type: String, required: true },
          pin1: { type: String, default: null },
          puk1: { type: String, default: null },
          pin2: { type: String, default: null },
          puk2: { type: String, default: null },
        },
        { _id: false },
      ),
      required: true,
      select: false,
    },
    priceMinor: { type: Number, required: true, min: 0, validate: Number.isInteger },
    premiumMinor: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    status: { type: String, enum: ["available", "reserved", "sold", "retired"], default: "available", index: true },
    reservation: {
      type: new Schema(
        {
          customer: { type: Schema.Types.ObjectId, ref: "User", required: true },
          until: { type: Date, required: true },
          order: { type: Schema.Types.ObjectId, ref: "Order" },
        },
        { _id: false },
      ),
      default: null,
    },
    customer: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    order: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    soldAt: { type: Date, default: null },
    batch: { type: String, default: null, trim: true, maxlength: 80, index: true },
    note: { type: String, default: null, trim: true, maxlength: 500 },
    card: {
      type: new Schema(
        {
          checkedAt: { type: Date, required: true },
          balanceMinor: { type: Number, default: null },
          currency: { type: String, default: null },
          blocked: { type: Boolean, default: null },
          lastUsedAt: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    legacyId: { type: Number, default: null, sparse: true },
  },
  { timestamps: true },
);

EsimNumberSchema.index({ status: 1, dialCode: 1, premiumMinor: 1 });
EsimNumberSchema.index({ "reservation.until": 1 }, { sparse: true });

if (models.EsimNumber) {
  delete models.EsimNumber;
}

export const EsimNumber = model<IEsimNumber>("EsimNumber", EsimNumberSchema);
