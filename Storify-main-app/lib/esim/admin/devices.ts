import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";
import { connectDB, mongoose } from "@/lib/db";
import { EsimDevice } from "@/models/esim-device.model";
import { ESIM_DEVICES, type DeviceBrand } from "@/lib/esim/storefront/devices";

/**
 * The device-compatibility list (ADM-11): kept by the admin in `EsimDevice`,
 * read by the storefront's device check. Until the admin adds or imports one,
 * the module's built-in list is used.
 */

async function readDeviceList(): Promise<DeviceBrand[]> {
  await connectDB();
  const rows = await EsimDevice.find().sort({ brand: 1, sort: 1, name: 1 }).lean();
  if (!rows.length) return ESIM_DEVICES;
  const brands = new Map<string, DeviceBrand>();
  for (const row of rows) {
    const brand = brands.get(row.brand) ?? { brand: row.brand, models: [] };
    brand.models.push({ name: row.name, ...(row.note ? { note: row.note } : {}), ...(row.supported ? {} : { supported: false }) });
    brands.set(row.brand, brand);
  }
  return [...brands.values()];
}

/** The list the storefront shows; cached with the destination pages. */
export const deviceList = unstable_cache(readDeviceList, ["esim-storefront-devices"], { revalidate: 3600, tags: ["esim-storefront"] });

function expire() {
  try {
    revalidateTag("esim-storefront", { expire: 0 });
  } catch {
    // Outside a request.
  }
}

export interface AdminDevice {
  id: string;
  brand: string;
  model: string;
  supported: boolean;
  note: string | null;
}

export async function listDevicesAdmin(search?: string): Promise<{ rows: AdminDevice[]; usingBuiltIn: boolean; builtInCount: number }> {
  await connectDB();
  const pattern = search?.trim() ? new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;
  const query = pattern ? { $or: [{ brand: pattern }, { name: pattern }] } : {};
  const [rows, total] = await Promise.all([
    EsimDevice.find(query).sort({ brand: 1, sort: 1, name: 1 }).limit(500).lean(),
    EsimDevice.estimatedDocumentCount(),
  ]);
  return {
    rows: rows.map((row) => ({ id: String(row._id), brand: row.brand, model: row.name, supported: row.supported, note: row.note })),
    usingBuiltIn: total === 0,
    builtInCount: ESIM_DEVICES.reduce((sum, brand) => sum + brand.models.length, 0),
  };
}

export async function saveDevice(input: { id?: string; brand: string; model: string; supported: boolean; note?: string | null }) {
  await connectDB();
  const values = { brand: input.brand.trim(), name: input.model.trim(), supported: input.supported, note: input.note?.trim() || null };
  if (input.id) {
    if (!mongoose.isValidObjectId(input.id)) throw new Error("Unknown device");
    await EsimDevice.updateOne({ _id: input.id }, { $set: values });
  } else {
    await new EsimDevice(values).save();
  }
  expire();
}

export async function deleteDevice(id: string) {
  await connectDB();
  if (!mongoose.isValidObjectId(id)) throw new Error("Unknown device");
  await EsimDevice.deleteOne({ _id: id });
  expire();
}

/** Copies the built-in list into the table; models already there are left as they are. */
export async function importBuiltInDevices() {
  await connectDB();
  const writes = ESIM_DEVICES.flatMap((brand, brandIndex) =>
    brand.models.map((model, index) => ({
      updateOne: {
        filter: { brand: brand.brand, name: model.name },
        update: { $setOnInsert: { brand: brand.brand, name: model.name, supported: true, note: model.note ?? null, sort: brandIndex * 1000 + index } },
        upsert: true,
      },
    })),
  );
  const result = await EsimDevice.bulkWrite(writes, { ordered: false });
  expire();
  return { added: result.upsertedCount };
}
