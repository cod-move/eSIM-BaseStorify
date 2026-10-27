import { mongoose } from "@/lib/db";
import type { EncryptedSecret } from "@/lib/auth/secret-box";

const { Schema, models, model } = mongoose;

/**
 * Extension payments (PAY, patch P15).
 *
 * Storify's checkout knows one gateway, "extension": it opens a checkout
 * attempt whose `gateway.extensionReference` is the checkout reference here,
 * and sends the shopper to the eSIM payment page. There the shopper picks a
 * method (`EsimPaymentMethod`, one plugin each) and every try is an
 * `EsimPayment`. A verified "paid" notification settles the attempt through
 * Storify's own `finalizeCapturedAttempt`, which writes the order.
 */

export interface IEsimPaymentMethod extends mongoose.Document {
  /** A key of PAYMENT_METHOD_DEFINITIONS (lib/esim/payments/registry.ts). */
  code: string;
  /** What the shopper sees; the definition's name when empty. */
  name: string;
  status: "active" | "disabled";
  /** Lower first on the payment page. */
  sort: number;
  credentials: Map<string, string>;
  secretCredentials: Map<string, EncryptedSecret>;
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

const EsimPaymentMethodSchema = new Schema<IEsimPaymentMethod>(
  {
    code: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, trim: true, maxlength: 80, default: "" },
    status: { type: String, enum: ["active", "disabled"], default: "disabled" },
    sort: { type: Number, default: 100 },
    credentials: { type: Map, of: String, default: {} },
    secretCredentials: { type: Map, of: EncryptedSecretSchema, default: {}, select: false },
  },
  { timestamps: true },
);

export const ESIM_PAYMENT_STATES = ["started", "pending", "paid", "failed", "expired"] as const;
export type EsimPaymentState = (typeof ESIM_PAYMENT_STATES)[number];

/**
 * order: this payment became the order.
 * duplicate: the checkout was already paid by another try — money to send back.
 * closed: the checkout had closed; Storify wrote a cancelled order and its refund.
 */
export type EsimPaymentOutcome = "order" | "duplicate" | "closed";

export interface IEsimPayment extends mongoose.Document {
  /** Ours, sent to the gateway as its merchant order number. */
  reference: string;
  /** The checkout attempt's `gateway.extensionReference`. */
  checkoutRef: string;
  attemptId: mongoose.Types.ObjectId;
  method: string;
  amountMinor: number;
  currency: string;
  state: EsimPaymentState;
  gatewayPaymentId?: string;
  /** What the shopper was handed: a page to go to, or QR data. */
  pay?: { kind: "redirect" | "qr"; data: string };
  customerId?: mongoose.Types.ObjectId;
  email?: string;
  paidAt?: Date;
  settlement?: {
    outcome: EsimPaymentOutcome;
    orderId?: mongoose.Types.ObjectId;
    orderNumber?: string;
    at: Date;
  };
  /** The last settlement failure, cleared when one succeeds. */
  error?: string;
  /** For the duplicate and closed outcomes: an admin marked the money returned. */
  refundedAt?: Date;
  notices: number;
  createdAt: Date;
  updatedAt: Date;
}

const EsimPaymentSchema = new Schema<IEsimPayment>(
  {
    reference: { type: String, required: true, unique: true, trim: true },
    checkoutRef: { type: String, required: true, trim: true, index: true },
    attemptId: { type: Schema.Types.ObjectId, required: true, ref: "CheckoutAttempt" },
    method: { type: String, required: true, trim: true },
    amountMinor: { type: Number, required: true, min: 1, validate: Number.isInteger },
    currency: { type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ },
    state: { type: String, enum: ESIM_PAYMENT_STATES, default: "started" },
    gatewayPaymentId: { type: String, trim: true },
    pay: {
      type: new Schema({ kind: { type: String, enum: ["redirect", "qr"], required: true }, data: { type: String, required: true, maxlength: 4000 } }, { _id: false }),
      default: undefined,
    },
    customerId: { type: Schema.Types.ObjectId, ref: "User" },
    email: { type: String, trim: true, lowercase: true },
    paidAt: Date,
    settlement: {
      type: new Schema(
        {
          outcome: { type: String, enum: ["order", "duplicate", "closed"], required: true },
          orderId: { type: Schema.Types.ObjectId, ref: "Order" },
          orderNumber: String,
          at: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: undefined,
    },
    error: { type: String, maxlength: 500 },
    refundedAt: Date,
    notices: { type: Number, default: 0 },
  },
  { timestamps: true },
);

/** The settlement sweep: paid, not settled. */
EsimPaymentSchema.index({ state: 1, "settlement.outcome": 1, paidAt: 1 });
/** Admin list, newest first. */
EsimPaymentSchema.index({ createdAt: -1 });

export const EsimPaymentMethod =
  (models.EsimPaymentMethod as mongoose.Model<IEsimPaymentMethod>) ||
  model<IEsimPaymentMethod>("EsimPaymentMethod", EsimPaymentMethodSchema);

export const EsimPayment =
  (models.EsimPayment as mongoose.Model<IEsimPayment>) || model<IEsimPayment>("EsimPayment", EsimPaymentSchema);
