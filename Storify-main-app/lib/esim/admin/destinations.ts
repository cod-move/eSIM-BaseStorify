import "server-only";

import { revalidateTag } from "next/cache";
import { connectDB, mongoose } from "@/lib/db";
import { PRODUCT_STATUS } from "@/config/app.config";
import { Product } from "@/models";
import { EsimDestination } from "@/models/esim-destination.model";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProductLink } from "@/models/esim-product-link.model";
import { revalidateProductContent } from "@/lib/cache-invalidation";
import { publishDestinations, setPlansStatus } from "@/lib/esim/admin/plans";

/**
 * Admin → eSIM → Destinations (ADM-02) and their variant ↔ supplier mapping
 * (ADM-06). A destination is a catalogue product slug: its plans, the store
 * product they are published as, and the admin's choices about it
 * (`EsimDestination`: featured, pinned primary suppliers).
 */

export interface DestinationFilters {
  search?: string;
  scope?: "local" | "regional" | "global";
  /** selling = an active product; hidden = a draft product; none = never published. */
  state?: "selling" | "hidden" | "none";
  featured?: boolean;
}

export interface AdminDestination {
  productSlug: string;
  name: string;
  scope: string;
  countries: number;
  plans: number;
  activePlans: number;
  suppliers: string[];
  productId: string | null;
  productHandle: string | null;
  productStatus: string | null;
  variants: number;
  featured: boolean;
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function listDestinationsAdmin(filters: DestinationFilters, options: { page?: number; pageSize?: number } = {}) {
  await connectDB();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, options.pageSize ?? 50));
  const match: Record<string, unknown> = {};
  if (filters.scope) match["coverage.scope"] = filters.scope;
  if (filters.search?.trim()) {
    const pattern = new RegExp(escapeRegex(filters.search.trim()), "i");
    match.$or = [{ destination: pattern }, { productSlug: pattern }, { "coverage.countries.name": pattern }];
  }
  const grouped = await EsimPlan.aggregate<{
    _id: string;
    name: string;
    scope: string;
    countries: number;
    plans: number;
    activePlans: number;
    suppliers: string[];
  }>([
    { $match: match },
    {
      $group: {
        _id: "$productSlug",
        name: { $first: "$destination" },
        scope: { $first: "$coverage.scope" },
        countries: { $max: { $size: "$coverage.countries" } },
        plans: { $sum: 1 },
        activePlans: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
        suppliers: { $addToSet: "$providerCode" },
      },
    },
    { $sort: { activePlans: -1, name: 1 } },
  ]);
  const slugs = grouped.map((row) => row._id);
  const [links, choices] = await Promise.all([
    EsimProductLink.find({ productSlug: { $in: slugs } }).select({ productSlug: 1, product: 1, variants: 1 }).lean(),
    EsimDestination.find({ productSlug: { $in: slugs } }).select({ productSlug: 1, featured: 1 }).lean(),
  ]);
  const products = await Product.find({ _id: { $in: links.map((link) => link.product) } })
    .select({ status: 1, slug: 1 })
    .lean<Array<{ _id: mongoose.Types.ObjectId; status: string; slug: string }>>();
  const productById = new Map(products.map((product) => [String(product._id), product]));
  const linkBySlug = new Map(links.map((link) => [link.productSlug, link]));
  const featured = new Set(choices.filter((choice) => choice.featured).map((choice) => choice.productSlug));

  let rows = grouped.map((row): AdminDestination => {
    const link = linkBySlug.get(row._id);
    const product = link ? productById.get(String(link.product)) : undefined;
    return {
      productSlug: row._id,
      name: row.name,
      scope: row.scope,
      countries: row.countries,
      plans: row.plans,
      activePlans: row.activePlans,
      suppliers: row.suppliers.sort(),
      productId: product ? String(product._id) : null,
      productHandle: product?.slug ?? null,
      productStatus: product?.status ?? null,
      variants: link?.variants.length ?? 0,
      featured: featured.has(row._id),
    };
  });
  if (filters.state === "selling") rows = rows.filter((row) => row.productStatus === PRODUCT_STATUS.ACTIVE);
  if (filters.state === "hidden") rows = rows.filter((row) => row.productStatus && row.productStatus !== PRODUCT_STATUS.ACTIVE);
  if (filters.state === "none") rows = rows.filter((row) => !row.productStatus);
  if (filters.featured) rows = rows.filter((row) => row.featured);
  const total = rows.length;
  return {
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

function expireStorefront() {
  try {
    revalidateTag("esim-storefront", { expire: 0 });
  } catch {
    // Outside a request; the cache lapses within minutes.
  }
}

export async function setFeatured(productSlugs: string[], featured: boolean) {
  await connectDB();
  await EsimDestination.bulkWrite(
    productSlugs.map((productSlug) => ({
      updateOne: { filter: { productSlug }, update: { $set: { featured } }, upsert: true },
    })),
  );
  expireStorefront();
  return { changed: productSlugs.length };
}

/** Shows or hides the destinations' store products (active ↔ draft); products not yet published are skipped. */
export async function setDestinationVisibility(productSlugs: string[], visible: boolean) {
  await connectDB();
  const links = await EsimProductLink.find({ productSlug: { $in: productSlugs } }).select({ product: 1 }).lean();
  const result = await Product.updateMany(
    { _id: { $in: links.map((link) => link.product) } },
    { $set: { status: visible ? PRODUCT_STATUS.ACTIVE : PRODUCT_STATUS.DRAFT } },
  );
  revalidateProductContent({});
  expireStorefront();
  return { changed: result.modifiedCount, skipped: productSlugs.length - links.length };
}

/** Switches every plan of the destinations on or off; publishing afterwards brings the store along. */
export async function setDestinationPlans(productSlugs: string[], status: "active" | "disabled") {
  let changed = 0;
  for (const productSlug of productSlugs) {
    changed += (await setPlansStatus({ filters: { productSlug } }, status)).changed;
  }
  return { changed };
}

export async function publishDestinationList(productSlugs: string[], status: "draft" | "active") {
  return publishDestinations({ productSlugs }, status);
}

/** A destination's published variants and, for each, every plan that can fulfil it (ADM-06). */
export async function getDestinationMapping(productSlug: string) {
  await connectDB();
  const [link, choice, plans] = await Promise.all([
    EsimProductLink.findOne({ productSlug }).lean(),
    EsimDestination.findOne({ productSlug }).lean(),
    EsimPlan.find({ productSlug })
      .select({ name: 1, providerCode: 1, status: 1, available: 1, retailPriceMinor: 1, retailPriceManual: 1, pricing: 1, cost: 1, data: 1, validityDays: 1, duration: 1 })
      .lean(),
  ]);
  if (!plans.length) return null;
  const planById = new Map(plans.map((plan) => [String(plan._id), plan]));
  const pins = new Map(Object.entries((choice?.pins ?? {}) as Record<string, unknown>).map(([key, value]) => [key, String(value)]));
  const view = (planId: string) => {
    const plan = planById.get(planId);
    if (!plan) return null;
    const retail = plan.retailPriceMinor;
    const cost = plan.pricing?.costUsdMinor ?? null;
    return {
      id: planId,
      name: plan.name,
      providerCode: plan.providerCode,
      status: plan.status,
      available: plan.available,
      costUsdMinor: cost,
      retailPriceMinor: retail,
      manualPrice: plan.retailPriceManual,
      marginPercent: retail && cost !== null ? Math.round(((retail - cost) / retail) * 1000) / 10 : null,
      perDay: plan.cost.billingUnit === "day",
    };
  };
  return {
    productSlug,
    name: plans[0].name.replace(/\s+\d+(\.\d+)?\s*(GB|MB).*$/i, "") || productSlug,
    productId: link ? String(link.product) : null,
    featured: choice?.featured ?? false,
    variants: (link?.variants ?? []).map((variant) => ({
      key: variant.key,
      name: variant.name,
      priceMinor: variant.priceMinor,
      pinned: pins.get(variant.key) ?? null,
      candidates: variant.candidates.map((id) => view(String(id))).filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    })),
  };
}

/** Pins (or unpins with null) the primary plan of one variant, then re-publishes the destination. */
export async function setPin(productSlug: string, variantKey: string, planId: string | null) {
  await connectDB();
  if (planId !== null) {
    if (!mongoose.isValidObjectId(planId)) throw new Error("Unknown plan");
    const plan = await EsimPlan.findOne({ _id: planId, productSlug }).select({ _id: 1 }).lean();
    if (!plan) throw new Error("That plan does not belong to this destination");
  }
  await EsimDestination.updateOne(
    { productSlug },
    planId === null ? { $unset: { [`pins.${variantKey}`]: "" } } : { $set: { [`pins.${variantKey}`]: new mongoose.Types.ObjectId(planId) } },
    { upsert: true },
  );
  return publishDestinations({ productSlugs: [productSlug] });
}
