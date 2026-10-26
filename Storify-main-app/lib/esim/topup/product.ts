import "server-only";

import { mongoose } from "@/lib/db";
import { PRODUCT_STATUS } from "@/config/app.config";
import { Product } from "@/models";
import { getEsimSettings } from "@/models/esim-pricing.model";
import { ensureDefaultVendorId } from "@/lib/vendors/multi-vendor";
import { productSlugBase, uniqueProductSlug } from "@/lib/products/product-slug";
import { assignProductLookupCodes } from "@/lib/products/barcode-normalization";
import { withInventoryWrite } from "@/lib/inventory/finance-context";
import { ensureCategory } from "@/lib/esim/catalog/category";

/**
 * The store product a top-up is sold as (TOP-03): one platform-owned digital
 * product with one variant, "eSIM Top-up". It is active, so the cart and
 * checkout take it, but not published to the online store
 * (`publishing.onlineStore: false`), so no listing, search, feed or product
 * page shows it — every storefront query applies that channel
 * (lib/catalog/product-visibility.ts), the cart and checkout do not.
 *
 * The variant's own price is 0 and never charged: a top-up line is priced
 * from its quote (lib/esim/cart), and a line that is not is refused.
 */

export const TOPUP_PRODUCT_TYPE = "esim-topup";
const OPTION_ID = "topup";
const VALUE_ID = "topup-data";

export interface TopupProductRef {
  productId: string;
  variantId: string;
}

let cached: { ref: TopupProductRef | null; at: number } | null = null;
const CACHE_MS = 60_000;

type LeanTopupProduct = { _id: mongoose.Types.ObjectId; variants?: Array<{ _id: mongoose.Types.ObjectId }> };

function refOf(product: LeanTopupProduct | null): TopupProductRef | null {
  const variant = product?.variants?.[0];
  return product && variant ? { productId: String(product._id), variantId: String(variant._id) } : null;
}

/** The top-up product, if it exists; never creates it. Cached for a minute. */
export async function findTopupProduct(): Promise<TopupProductRef | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.ref;
  const settings = await getEsimSettings();
  const product = settings.topupProductId
    ? await Product.findById(settings.topupProductId).select({ variants: 1 }).lean<LeanTopupProduct | null>()
    : await Product.findOne({ productType: TOPUP_PRODUCT_TYPE }).sort({ createdAt: 1 }).select({ variants: 1 }).lean<LeanTopupProduct | null>();
  cached = { ref: refOf(product), at: Date.now() };
  return cached.ref;
}

export async function isTopupVariant(variantId: unknown): Promise<boolean> {
  if (!variantId) return false;
  const ref = await findTopupProduct();
  return Boolean(ref && ref.variantId === String(variantId));
}

/**
 * The top-up product, created by the catalogue publish (an admin's request
 * or the CLI) — a product is never created inside a shopper's request. Kept
 * active and unpublished; an admin who deletes it gets a new one on the next
 * publish.
 */
export async function ensureTopupProduct(): Promise<TopupProductRef> {
  const existing = await findTopupProduct();
  if (existing) {
    // Re-assert what the cart needs, in case it was edited in the products admin.
    await Product.updateOne(
      { _id: existing.productId },
      { $set: { status: PRODUCT_STATUS.ACTIVE, "publishing.onlineStore": false } },
    );
    return existing;
  }
  const vendor = await ensureDefaultVendorId();
  if (!vendor.vendorId) throw new Error(`No store profile to own the top-up product (${vendor.problem ?? "unknown"})`);
  const category = await ensureCategory();
  const productId = new mongoose.Types.ObjectId();
  const variantId = new mongoose.Types.ObjectId();
  const name = "eSIM Top-up";
  const slug = await uniqueProductSlug(productSlugBase({ handle: "esim-topup", title: name, productId }));
  const data: Record<string, unknown> = {
    _id: productId,
    vendorId: vendor.vendorId,
    productSource: "admin",
    name,
    title: name,
    shortDescription: "More data for an eSIM you already have. Bought from the eSIM's page in your account.",
    description: "<p>A top-up for an eSIM in your account. It is added to the eSIM you chose; nothing new to install.</p>",
    slug,
    handle: slug,
    seo: { handle: slug },
    category,
    productType: TOPUP_PRODUCT_TYPE,
    tags: ["esim", "esim-topup"],
    price: 0,
    status: PRODUCT_STATUS.ACTIVE,
    publishing: { onlineStore: false, pointOfSale: false },
    returns: { finalSale: true },
    shipping: { isPhysicalProduct: false },
    inventory: { tracked: false, continueSellingWhenOutOfStock: false },
    options: [{ _id: OPTION_ID, name: "Top-up", position: 0, values: [{ _id: VALUE_ID, value: "Data top-up", position: 0 }] }],
    variants: [
      {
        _id: variantId,
        name: "Data top-up",
        sku: "ESIM-TOPUP",
        price: 0,
        cost: 0,
        stock: 0,
        requiresShipping: false,
        optionValues: [{ optionId: OPTION_ID, optionName: "Top-up", valueId: VALUE_ID, value: "Data top-up" }],
      },
    ],
  };
  assignProductLookupCodes(data);
  const product = new Product(data);
  await product.validate();
  await withInventoryWrite(
    { reason: "opening", sourceKind: "product", sourceId: String(productId), channel: "system" },
    () => product.save(),
  );
  const settings = await getEsimSettings();
  settings.topupProductId = productId;
  await settings.save();
  cached = { ref: { productId: String(productId), variantId: String(variantId) }, at: Date.now() };
  return cached.ref!;
}
