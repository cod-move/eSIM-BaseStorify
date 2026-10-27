import { mongoose } from "@/lib/db";
import { Product } from "@/models";

/**
 * For the eSIM dev scripts: publishing (and the import) creates the hidden top-up, wallet and migrated products
 * (lib/esim/catalog/hidden-product.ts) when the database has none. Call before the
 * run; the returned function removes what it made — with what the saves wrote —
 * if this run made it, so the cleanup leaves every collection as it was.
 */
export async function keepTopupProductAsItWas(): Promise<() => Promise<void>> {
  const db = mongoose.connection.db!;
  const types = ["esim-topup", "esim-wallet-topup", "esim-migrated"];
  const existed = new Set((await Product.collection.distinct("productType", { productType: { $in: types } })) as string[]);
  const settings = await db.collection("esimsettings").findOne({ key: "default" }, { projection: { topupProductId: 1, walletProductId: 1, migratedProductId: 1 } });
  return async () => {
    const fresh = types.filter((type) => !existed.has(type));
    if (!fresh.length) return;
    const made = await Product.collection.find({ productType: { $in: fresh } }).project({ _id: 1 }).toArray();
    for (const { _id: productId } of made) {
      for (const name of ["audit_logs", "inventorymovements", "inventory_movements", "metacatalogsyncs", "productsearches", "stockmovements"]) {
        await db.collection(name).deleteMany({ $or: [{ productId }, { productId: String(productId) }, { resourceId: String(productId) }, { sourceId: String(productId) }] }).catch(() => undefined);
      }
      await Product.collection.deleteOne({ _id: productId });
    }
    for (const key of ["topupProductId", "walletProductId", "migratedProductId"] as const) {
      await db.collection("esimsettings").updateOne(
        { key: "default" },
        settings?.[key] ? { $set: { [key]: settings[key] } } : { $unset: { [key]: "" } },
      );
    }
  };
}
