import { mongoose } from "@/lib/db";

const { Schema, models, model } = mongoose;

/**
 * TopConnect's sequential order id (NUM-08): `last` is the last id the
 * account accepted as far as the store knows; `lease` is the lock held while
 * one transfer is made, so ids are handed out one at a time. One document,
 * `_id: "topconnect"`.
 */
export interface IEsimNumberSequence {
  _id: string;
  last: number | null;
  lease: { owner: string; until: Date } | null;
}

const EsimNumberSequenceSchema = new Schema<IEsimNumberSequence>(
  {
    _id: { type: String, required: true },
    last: { type: Number, default: null },
    lease: {
      type: new Schema({ owner: { type: String, required: true }, until: { type: Date, required: true } }, { _id: false }),
      default: null,
    },
  },
  { timestamps: true },
);

if (models.EsimNumberSequence) {
  delete models.EsimNumberSequence;
}

export const EsimNumberSequence = model<IEsimNumberSequence>("EsimNumberSequence", EsimNumberSequenceSchema);
