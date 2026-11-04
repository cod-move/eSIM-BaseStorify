import "server-only";

import { mongoose } from "@/lib/db";
import { PRODUCT_STATUS } from "@/config/app.config";
import { Product } from "@/models";
import { getEsimSettings, type IEsimSettings } from "@/models/esim-pricing.model";
import { ensureDefaultVendorId } from "@/lib/vendors/multi-vendor";
import { productSlugBase, uniqueProductSlug } from "@/lib/products/product-slug";
import { assignProductLookupCodes } from "@/lib/products/barcode-normalization";
import { withInventoryWrite } from "@/lib/inventory/finance-context";
import { ensureCategory } from "@/lib/esim/catalog/category";

/**
 * A store product the eSIM module sells through the normal cart and
 * checkout without showing it anywhere: the eSIM top-up (TOP-03) and the
 * wallet top-up (WAL-01). One platform-owned digital product with one
 * variant; active, so the cart and checkout take it, but not published to
 * the online store (`publishing.onlineStore: false`), so no listing, search,
 * feed or product page shows it — every storefront query applies that
 * channel (lib/catalog/product-visibility.ts), the cart and checkout do not.
 *
 * The variant's own price is 0 and never charged: such a line is priced by
 * the eSIM module (lib/esim/cart), and a line it cannot price is refused.
 *
 * Created by the catalogue publish (an admin's request or the CLI) — a
 * product is never created inside a shopper's request. An admin who deletes
 * one gets a new one on the next publish.
 */

export interface HiddenProductRef {
  productId: string;
  variantId: string;
}

export interface HiddenProductSpec {
  productType: string;
  settingsKey: "topupProductId" | "walletProductId" | "migratedProductId" | "paymentFeeProductId" | "numberProductId" | "numberTopupProductId";
  name: string;
  handle: string;
  shortDescription: string;
  description: string;
  sku: string;
  optionName: string;
  variantName: string;
  /** Whether sales tax applies (Storify's default: yes). */
  chargeTax?: boolean;
}

const CACHE_MS = 60_000;
type LeanProduct = { _id: mongoose.Types.ObjectId; variants?: Array<{ _id: mongoose.Types.ObjectId }> };

function refOf(product: LeanProduct | null): HiddenProductRef | null {
  const variant = product?.variants?.[0];
  return product && variant ? { productId: String(product._id), variantId: String(variant._id) } : null;
}

export function hiddenProduct(spec: HiddenProductSpec) {
  let cached: { ref: HiddenProductRef | null; at: number } | null = null;

  /** The product, if it exists; never creates it. Cached for a minute. */
  async function find(): Promise<HiddenProductRef | null> {
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.ref;
    const settings = await getEsimSettings();
    const id = (settings as IEsimSettings)[spec.settingsKey];
    const product = id
      ? await Product.findById(id).select({ variants: 1 }).lean<LeanProduct | null>()
      : await Product.findOne({ productType: spec.productType }).sort({ createdAt: 1 }).select({ variants: 1 }).lean<LeanProduct | null>();
    cached = { ref: refOf(product), at: Date.now() };
    return cached.ref;
  }

  async function isVariant(variantId: unknown): Promise<boolean> {
    if (!variantId) return false;
    const ref = await find();
    return Boolean(ref && ref.variantId === String(variantId));
  }

  async function ensure(): Promise<HiddenProductRef> {
    const existing = await find();
    if (existing) {
      // Re-assert what the cart needs, in case it was edited in the products admin.
      await Product.updateOne(
        { _id: existing.productId },
        { $set: { status: PRODUCT_STATUS.ACTIVE, "publishing.onlineStore": false } },
      );
      return existing;
    }
    const vendor = await ensureDefaultVendorId();
    if (!vendor.vendorId) throw new Error(`No store profile to own the product "${spec.name}" (${vendor.problem ?? "unknown"})`);
    const category = await ensureCategory();
    const productId = new mongoose.Types.ObjectId();
    const variantId = new mongoose.Types.ObjectId();
    const optionId = spec.handle;
    const valueId = `${spec.handle}-value`;
    const slug = await uniqueProductSlug(productSlugBase({ handle: spec.handle, title: spec.name, productId }));
    const data: Record<string, unknown> = {
      _id: productId,
      vendorId: vendor.vendorId,
      productSource: "admin",
      name: spec.name,
      title: spec.name,
      shortDescription: spec.shortDescription,
      description: spec.description,
      slug,
      handle: slug,
      seo: { handle: slug },
      category,
      productType: spec.productType,
      tags: ["esim", spec.productType],
      price: 0,
      status: PRODUCT_STATUS.ACTIVE,
      publishing: { onlineStore: false, pointOfSale: false },
      returns: { finalSale: true },
      shipping: { isPhysicalProduct: false },
      ...(spec.chargeTax === false ? { chargeTax: false } : {}),
      inventory: { tracked: false, continueSellingWhenOutOfStock: false },
      options: [{ _id: optionId, name: spec.optionName, position: 0, values: [{ _id: valueId, value: spec.variantName, position: 0 }] }],
      variants: [
        {
          _id: variantId,
          name: spec.variantName,
          sku: spec.sku,
          price: 0,
          cost: 0,
          stock: 0,
          requiresShipping: false,
          optionValues: [{ optionId, optionName: spec.optionName, valueId, value: spec.variantName }],
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
    settings.set(spec.settingsKey, productId);
    await settings.save();
    cached = { ref: { productId: String(productId), variantId: String(variantId) }, at: Date.now() };
    return cached.ref!;
  }

  return { find, isVariant, ensure };
}
