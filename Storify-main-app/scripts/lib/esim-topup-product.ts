import { mongoose } from "@/lib/db";
import { Product } from "@/models";

/**
 * For the eSIM dev scripts: publishing creates the hidden top-up product
 * (lib/esim/topup/product.ts) when the database has none. Call before the
 * run; the returned function removes it again — with what its save wrote —
 * if this run made it, so the cleanup leaves every collection as it was.
 */
export async function keepTopupProductAsItWas(): Promise<() => Promise<void>> {
  const db = mongoose.connection.db!;
  const existed = Boolean(await Product.exists({ productType: "esim-topup" }));
  const settings = await db.collection("esimsettings").findOne({ key: "default" }, { projection: { topupProductId: 1 } });
  return async () => {
    if (existed) return;
    const made = await Product.collection.find({ productType: "esim-topup" }).project({ _id: 1 }).toArray();
    for (const { _id: productId } of made) {
      for (const name of ["audit_logs", "inventorymovements", "inventory_movements", "metacatalogsyncs", "productsearches", "stockmovements"]) {
        await db.collection(name).deleteMany({ $or: [{ productId }, { productId: String(productId) }, { resourceId: String(productId) }, { sourceId: String(productId) }] }).catch(() => undefined);
      }
      await Product.collection.deleteOne({ _id: productId });
    }
    await db.collection("esimsettings").updateOne(
      { key: "default" },
      settings?.topupProductId ? { $set: { topupProductId: settings.topupProductId } } : { $unset: { topupProductId: "" } },
    );
  };
}
