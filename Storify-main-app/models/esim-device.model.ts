import { mongoose } from "@/lib/db";

const { Schema, models, model } = mongoose;

/**
 * A phone or tablet in the device-compatibility list (ADM-11), kept by the
 * admin. While the collection is empty the storefront uses the list built
 * into the module (lib/esim/storefront/devices.ts); the admin page can import
 * that list as a starting point.
 */
export interface IEsimDevice extends mongoose.Document {
  brand: string;
  /** The model name, e.g. "iPhone 15 Pro" (`model` is taken by Mongoose). */
  name: string;
  supported: boolean;
  note: string | null;
  sort: number;
  createdAt: Date;
  updatedAt: Date;
}

const EsimDeviceSchema = new Schema<IEsimDevice>(
  {
    brand: { type: String, required: true, trim: true, maxlength: 60 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    supported: { type: Boolean, default: true },
    note: { type: String, default: null, maxlength: 300 },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true },
);

EsimDeviceSchema.index({ brand: 1, name: 1 }, { unique: true });

if (models.EsimDevice) {
  delete models.EsimDevice;
}

export const EsimDevice = model<IEsimDevice>("EsimDevice", EsimDeviceSchema);
