import "server-only";

import { mongoose } from "@/lib/db";
import { Category } from "@/models/category.model";
import { getEsimSettings } from "@/models/esim-pricing.model";

/** The storefront category eSIM products (and the top-up product) are filed under, created on first use. */
export async function ensureCategory(): Promise<mongoose.Types.ObjectId> {
  const settings = await getEsimSettings();
  if (settings.categoryId && (await Category.exists({ _id: settings.categoryId }))) return settings.categoryId;
  const category =
    (await Category.findOne({ slug: "esim" })) ??
    (await Category.create({ name: "eSIM", slug: "esim", description: "Travel eSIM data plans", isActive: true }));
  settings.categoryId = category._id as mongoose.Types.ObjectId;
  await settings.save();
  return settings.categoryId;
}
