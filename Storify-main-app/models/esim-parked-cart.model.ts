import { mongoose } from "@/lib/db";

const { Schema, models, model } = mongoose;

/**
 * Cart lines set aside while the shopper adds money to their balance
 * (WAL-01). A wallet top-up is checked out on its own (patch P19), so the
 * rest of the cart waits here, as stored, and goes back once the top-up is
 * paid or the shopper returns to checkout without it. One per shopper.
 */
export interface IEsimParkedCart extends mongoose.Document {
  user: mongoose.Types.ObjectId;
  items: Array<Record<string, unknown>>;
  parkedAt: Date;
}

const EsimParkedCartSchema = new Schema<IEsimParkedCart>({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  // The lines exactly as the cart stored them, so they go back unchanged.
  items: { type: Schema.Types.Mixed, default: () => [] },
  parkedAt: { type: Date, required: true },
});

if (models.EsimParkedCart) {
  delete models.EsimParkedCart;
}

export const EsimParkedCart = model<IEsimParkedCart>("EsimParkedCart", EsimParkedCartSchema);
