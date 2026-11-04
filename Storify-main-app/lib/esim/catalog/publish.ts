import "server-only";

import { mongoose } from "@/lib/db";
import { PRODUCT_STATUS } from "@/config/app.config";
import { Product } from "@/models";
import { EsimPlan, type IEsimPlan } from "@/models/esim-plan.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { EsimProductLink, type IEsimProductLink } from "@/models/esim-product-link.model";
import { EsimDestination } from "@/models/esim-destination.model";
import { ensureDefaultVendorId } from "@/lib/vendors/multi-vendor";
import { productSlugBase, uniqueProductSlug } from "@/lib/products/product-slug";
import { assignProductLookupCodes } from "@/lib/products/barcode-normalization";
import { runProductAfterSave, type ProductSaveSide } from "@/lib/products/product-after-save";
import { syncProductCategory } from "@/lib/catalog/categories";
import { revalidateTag } from "next/cache";
import { revalidateProductContent } from "@/lib/cache-invalidation";
import { markProductsForCatalogSync } from "@/lib/meta-catalog/sync-marks";
import { withInventoryWrite } from "@/lib/inventory/finance-context";
import { slugify } from "@/lib/esim/providers/json";
import { shownBundles } from "@/lib/esim/providers/registry";
import { planProducts, type PlannedProduct, type VariantPlan } from "@/lib/esim/catalog/variants";
import { ensureCategory } from "@/lib/esim/catalog/category";
import { ensureTopupProduct } from "@/lib/esim/topup/product";
import { ensureWalletProduct } from "@/lib/esim/wallet/product";

/** The destination pages' cache tag (lib/esim/storefront/catalog.ts). */
const STOREFRONT_TAG = "esim-storefront";

/**
 * Publishes priced, active plans as Storify products (CAT-05/06).
 *
 * Creating a product follows the steps of the admin "new product" route
 * (app/api/admin/products/route.ts POST) without patching it: the house
 * vendor, a store-wide unique slug, lookup codes, the inventory write
 * context, the category count, cache revalidation and the Meta catalog mark.
 *
 * Re-publishing touches only what the catalogue owns — variants, options and
 * the price — and keeps each variant's id, so carts and orders that point at
 * it stay valid. Name, description, images and status stay as an admin left
 * them. A destination with nothing left to sell goes back to draft; it is
 * never deleted.
 */

const DATA_OPTION = "esim-data";
const VALIDITY_OPTION = "esim-validity";
const PLAN_OPTION = "esim-plan";

export interface PublishResult {
  created: string[];
  updated: string[];
  unchanged: string[];
  drafted: string[];
}

const toUnits = (minor: number) => Math.round(minor) / 100;

async function eligiblePlans(productSlugs?: string[]): Promise<VariantPlan[]> {
  const providers = await EsimProvider.find({ status: "active" }).select({ code: 1, priority: 1 }).lean();
  const priority = new Map(providers.map((provider) => [provider.code, provider.priority]));
  const plans = await EsimPlan.find({
    status: "active",
    available: true,
    retailPriceMinor: { $ne: null },
    providerCode: { $in: [...priority.keys()] },
    ...(productSlugs ? { productSlug: { $in: productSlugs } } : {}),
  })
    .select({
      providerCode: 1, productSlug: 1, destination: 1, data: 1, validityDays: 1, duration: 1,
      cost: 1, retailPriceMinor: 1, pricing: 1, fairUse: 1, coverage: 1, supplierNetworks: 1,
    })
    .lean<IEsimPlan[]>();
  // A plan whose days can be picked but that is not priced per day (or the
  // other way round) has no price we could put on a chosen number of days.
  const dayPriced = (plan: IEsimPlan) => plan.duration.configurable && plan.cost.billingUnit === "day";
  const sellable = plans.filter((plan) => plan.duration.configurable === (plan.cost.billingUnit === "day"));
  return sellable.map((plan) => ({
    id: String(plan._id),
    providerCode: plan.providerCode,
    providerPriority: priority.get(plan.providerCode) ?? 100,
    productSlug: plan.productSlug,
    destination: plan.destination,
    dataType: plan.data.type,
    megabytes: plan.data.megabytes,
    dataLabel: plan.data.label,
    validityDays: plan.validityDays,
    dayPriced: dayPriced(plan),
    minDays: plan.duration.minDays,
    maxDays: plan.duration.maxDays,
    defaultDays: plan.duration.defaultDays,
    retailPriceMinor: plan.retailPriceMinor ?? 0,
    costUsdMinor: plan.pricing?.costUsdMinor ?? 0,
    highSpeedGbPerDay: plan.fairUse?.highSpeedGbPerDay ?? null,
    // The catalogue's operators, else those fetched on their own (CAT-10) — as the storefront shows them.
    networks: plan.coverage?.networks?.length ? plan.coverage.networks : (plan.supplierNetworks?.list ?? []),
    breakoutIp: plan.coverage?.breakoutIp ?? [],
  }));
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** Built from the primary plans: where it works, on which networks, how it starts. */
async function describe(planned: PlannedProduct) {
  const primaryIds = planned.variants.map((variant) => variant.candidates[0]);
  const plans = await EsimPlan.find({ _id: { $in: primaryIds } })
    .select({ coverage: 1, speed: 1, tethering: 1, activation: 1, bundles: 1, providerCode: 1 })
    .lean<IEsimPlan[]>();
  const countries = new Map<string, string>();
  const networks = new Map<string, Set<string>>();
  const speeds = new Set<string>();
  for (const plan of plans) {
    for (const country of plan.coverage.countries) countries.set(country.code, country.name);
    for (const network of plan.coverage.networks) {
      const name = countries.get(network.countryCode) ?? network.countryCode;
      networks.set(name, (networks.get(name) ?? new Set()).add(network.operator));
    }
    for (const speed of plan.speed) speeds.add(speed);
  }
  const items = [
    countries.size > 1
      ? `Works in ${countries.size} countries: ${escapeHtml([...countries.values()].sort().join(", "))}.`
      : null,
    networks.size
      ? `Networks: ${escapeHtml(
          [...networks].slice(0, 12).map(([country, operators]) =>
            countries.size > 1 ? `${country} (${[...operators].join(", ")})` : [...operators].join(", "),
          ).join("; "),
        )}.`
      : null,
    speeds.size ? `Speed: ${escapeHtml([...speeds].sort().join(" / "))}.` : null,
    // Only what holds for every option the shopper can pick.
    plans.every((plan) => plan.tethering) ? "Hotspot / tethering allowed." : null,
    plans.every((plan) => plan.activation.billingStarts === "first_connection")
      ? "Validity starts when the eSIM first connects at your destination."
      : null,
    plans.every((plan) => shownBundles(plan.providerCode, plan.bundles).some((bundle) => bundle.type === "vpn")) ? "Includes a VPN subscription." : null,
  ].filter(Boolean);
  const name = `${planned.destination} eSIM`;
  return {
    name,
    shortDescription: `Mobile data for ${planned.destination}. Instant delivery by email, install by QR code.`,
    description:
      `<p>Stay connected in ${escapeHtml(planned.destination)} with a data-only eSIM: buy, scan the QR code, and you are online when you land.</p>` +
      `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`,
  };
}

function optionsAndVariants(planned: PlannedProduct, existing: IEsimProductLink | null) {
  const valueId = (option: string, value: string) => `${option}-${slugify(value) || "value"}`;
  const dataValues = [...new Set(planned.variants.map((variant) => variant.dataValue))];
  const validityValues = [...new Set(planned.variants.map((variant) => variant.validityValue))];
  // A third option only where some variants share data and days but differ in networks or exit IP.
  const distinct = planned.variants.some((variant) => variant.distinction);
  const planValue = (variant: PlannedProduct["variants"][number]) => variant.distinction ?? "Standard";
  const planValues = distinct ? [...new Set(planned.variants.map(planValue))] : [];
  const options = [
    {
      _id: DATA_OPTION,
      name: "Data",
      position: 0,
      values: dataValues.map((value, position) => ({ _id: valueId(DATA_OPTION, value), value, position })),
    },
    {
      _id: VALIDITY_OPTION,
      name: "Validity",
      position: 1,
      values: validityValues.map((value, position) => ({ _id: valueId(VALIDITY_OPTION, value), value, position })),
    },
    ...(distinct
      ? [
          {
            _id: PLAN_OPTION,
            name: "Network / IP",
            position: 2,
            values: planValues.map((value, position) => ({ _id: valueId(PLAN_OPTION, value), value, position })),
          },
        ]
      : []),
  ];
  const known = new Map((existing?.variants ?? []).map((variant) => [variant.key, variant.variantId]));
  const variants = planned.variants.map((variant) => ({
    key: variant.key,
    candidates: variant.candidates,
    priceMinor: variant.priceMinor,
    perDay: variant.perDay,
    doc: {
      _id: known.get(variant.key) ?? new mongoose.Types.ObjectId(),
      name: variant.name,
      sku: `ESIM-${planned.productSlug}-${variant.key}`.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 64),
      price: toUnits(variant.priceMinor),
      cost: toUnits(variant.costUsdMinor),
      stock: 0,
      requiresShipping: false,
      optionValues: [
        { optionId: DATA_OPTION, optionName: "Data", valueId: valueId(DATA_OPTION, variant.dataValue), value: variant.dataValue },
        { optionId: VALIDITY_OPTION, optionName: "Validity", valueId: valueId(VALIDITY_OPTION, variant.validityValue), value: variant.validityValue },
        ...(distinct ? [{ optionId: PLAN_OPTION, optionName: "Network / IP", valueId: valueId(PLAN_OPTION, planValue(variant)), value: planValue(variant) }] : []),
      ],
    },
  }));
  return { options, variants };
}

/** The catalogue-owned part of a product, compared to skip no-op saves. */
function fingerprint(variants: Array<{ doc: Record<string, unknown> }>, options: unknown) {
  return JSON.stringify({
    options,
    variants: variants.map(({ doc }) => [String(doc._id), doc.name, doc.price, doc.cost, doc.sku]),
  });
}

function storedFingerprint(product: { variants?: unknown[]; options?: unknown[] }) {
  const variants = (product.variants ?? []) as Array<Record<string, unknown>>;
  const options = ((product.options ?? []) as Array<Record<string, unknown>>).map((option) => ({
    _id: option._id,
    name: option.name,
    position: option.position,
    values: ((option.values ?? []) as Array<Record<string, unknown>>).map((value) => ({
      _id: value._id,
      value: value.value,
      position: value.position,
    })),
  }));
  return JSON.stringify({
    options,
    variants: variants.map((variant) => [String(variant._id), variant.name, variant.price, variant.cost, variant.sku]),
  });
}

async function writeLink(planned: PlannedProduct, productId: mongoose.Types.ObjectId, variants: ReturnType<typeof optionsAndVariants>["variants"]) {
  await EsimProductLink.updateOne(
    { productSlug: planned.productSlug },
    {
      $set: {
        product: productId,
        publishedAt: new Date(),
        variants: variants.map((variant) => ({
          key: variant.key,
          variantId: variant.doc._id,
          name: variant.doc.name,
          priceMinor: variant.priceMinor,
          perDay: variant.perDay,
          candidates: variant.candidates.map((id) => new mongoose.Types.ObjectId(id)),
        })),
      },
    },
    { upsert: true },
  );
  await EsimPlan.updateMany({ productId }, { $set: { productId: null, variantId: null } });
  await EsimPlan.bulkWrite(
    variants.flatMap((variant) =>
      variant.candidates.map((id) => ({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(id) },
          update: { $set: { productId, variantId: variant.doc._id } },
        },
      })),
    ),
    { ordered: false },
  );
}

const SYSTEM_AUDIT = { userId: "system", userEmail: "esim-catalog", userRole: "system" };

async function createProduct(planned: PlannedProduct, status: string) {
  const vendor = await ensureDefaultVendorId();
  if (!vendor.vendorId) throw new Error(`No store profile to own eSIM products (${vendor.problem ?? "unknown"})`);
  const category = await ensureCategory();
  const { options, variants } = optionsAndVariants(planned, null);
  const content = await describe(planned);
  const productId = new mongoose.Types.ObjectId();
  const slug = await uniqueProductSlug(productSlugBase({ handle: planned.productSlug, title: content.name, productId }));
  const data: Record<string, unknown> & { variants: Record<string, unknown>[] } = {
    _id: productId,
    vendorId: vendor.vendorId,
    productSource: "admin",
    ...content,
    title: content.name,
    slug,
    handle: slug,
    seo: { handle: slug },
    category,
    productType: "esim",
    tags: ["esim"],
    price: Math.min(...variants.map((variant) => variant.doc.price)),
    status,
    shipping: { isPhysicalProduct: false },
    inventory: { tracked: false, continueSellingWhenOutOfStock: false },
    options,
    variants: variants.map((variant) => variant.doc),
  };
  assignProductLookupCodes(data);
  const product = new Product(data);
  await product.validate();
  await withInventoryWrite(
    { reason: "opening", sourceKind: "product", sourceId: String(productId), channel: "system" },
    () => product.save(),
  );
  await syncProductCategory(null, String(category));
  revalidateProductContent({ slugs: [slug] });
  await markProductsForCatalogSync([productId]);
  await writeLink(planned, productId, variants);
  return slug;
}

async function updateProduct(planned: PlannedProduct, link: IEsimProductLink) {
  const product = await Product.findById(link.product);
  if (!product) {
    await EsimProductLink.deleteOne({ _id: link._id });
    return null;
  }
  const { options, variants } = optionsAndVariants(planned, link);
  if (storedFingerprint(product.toObject()) === fingerprint(variants, options)) {
    await writeLink(planned, product._id as mongoose.Types.ObjectId, variants);
    return "unchanged" as const;
  }
  const before = product.toObject() as unknown as ProductSaveSide;
  product.set("options", options);
  product.set("variants", variants.map((variant) => variant.doc));
  product.set("price", Math.min(...variants.map((variant) => variant.doc.price)));
  assignProductLookupCodes(product as unknown as Record<string, unknown> & { variants?: Record<string, unknown>[] });
  await withInventoryWrite(
    { reason: "opening", sourceKind: "product", sourceId: String(product._id), channel: "system" },
    () => product.save(),
  );
  await runProductAfterSave({
    productId: String(product._id),
    before,
    after: product.toObject() as unknown as ProductSaveSide,
    audit: SYSTEM_AUDIT,
    defer: (task) => void task(),
  });
  await markProductsForCatalogSync([product._id]);
  await writeLink(planned, product._id as mongoose.Types.ObjectId, variants);
  return "updated" as const;
}

/**
 * @param productSlugs only these destinations; omitted = everything, which
 *   also drafts destinations that have nothing left to sell.
 * @param status the status a newly created product gets (default draft).
 */
export async function publishProducts(options: { productSlugs?: string[]; status?: "draft" | "active" } = {}) {
  const status = options.status === "active" ? PRODUCT_STATUS.ACTIVE : PRODUCT_STATUS.DRAFT;
  const pins = new Map(
    (await EsimDestination.find(options.productSlugs ? { productSlug: { $in: options.productSlugs } } : {}).select({ productSlug: 1, pins: 1 }).lean()).map(
      (destination) => [destination.productSlug, new Map(Object.entries(destination.pins ?? {}).map(([key, planId]) => [key, String(planId)]))],
    ),
  );
  const planned = planProducts(await eligiblePlans(options.productSlugs), pins).filter(
    (product) => product.variants.length > 0,
  );
  const links = new Map(
    (await EsimProductLink.find(options.productSlugs ? { productSlug: { $in: options.productSlugs } } : {})).map(
      (link) => [link.productSlug, link],
    ),
  );
  const result: PublishResult = { created: [], updated: [], unchanged: [], drafted: [] };

  for (const product of planned) {
    const link = links.get(product.productSlug);
    const outcome = link ? await updateProduct(product, link) : null;
    if (outcome === "updated") result.updated.push(product.productSlug);
    else if (outcome === "unchanged") result.unchanged.push(product.productSlug);
    else {
      await createProduct(product, status);
      result.created.push(product.productSlug);
    }
    links.delete(product.productSlug);
  }

  // Destinations with nothing left to sell stop showing; their link stays so
  // a later publish brings the same product back.
  for (const link of links.values()) {
    const changed = await Product.updateOne(
      { _id: link.product, status: { $ne: PRODUCT_STATUS.DRAFT } },
      { $set: { status: PRODUCT_STATUS.DRAFT } },
    );
    if (changed.modifiedCount) {
      result.drafted.push(link.productSlug);
      revalidateProductContent({});
    }
  }
  // Whatever is on sale can be topped up later, and paid for from a balance:
  // the hidden top-up and wallet products are made here, in the admin's
  // publish, never in a shopper's request.
  if (planned.length) {
    await ensureTopupProduct().catch((error) => console.error("[esim] top-up product could not be created:", error));
    await ensureWalletProduct().catch((error) => console.error("[esim] wallet product could not be created:", error));
  }
  // The destination pages read the catalogue through their own cache.
  try {
    revalidateTag(STOREFRONT_TAG, { expire: 0 });
  } catch {
    // Outside a Next.js request (the CLI); that cache lapses within minutes anyway.
  }
  return result;
}
