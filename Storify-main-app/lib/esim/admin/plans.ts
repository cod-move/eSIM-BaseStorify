import "server-only";

import { connectDB, mongoose } from "@/lib/db";
import { EsimPlan, type IEsimPlan } from "@/models/esim-plan.model";
import { publishProducts } from "@/lib/esim/catalog/publish";
import { repricePlans } from "@/lib/esim/pricing/reprice";
import type { CoverageScope } from "@/lib/esim/providers/types";

/**
 * Admin → eSIM → Plans (ADM-03): every supplier plan with its cost, price
 * and margin; filters; switching plans on and off in bulk; a hand-set price;
 * publishing the destinations of the chosen plans as store products.
 *
 * Plans are synced switched off: nothing sells until an admin turns it on
 * and publishes it.
 */

export interface PlanFilters {
  provider?: string;
  scope?: CoverageScope;
  country?: string;
  status?: "active" | "disabled";
  /** "unavailable" = the supplier no longer offers it. */
  availability?: "available" | "unavailable";
  search?: string;
  productSlug?: string;
}

export type PlanSort = "name" | "cost" | "price" | "margin" | "updated";

export interface AdminPlanRow {
  id: string;
  name: string;
  providerCode: string;
  productSlug: string;
  destination: string;
  scope: CoverageScope;
  countryCount: number;
  data: string;
  dataType: string;
  days: string;
  cost: { currency: string; amountMinor: number; perDay: boolean };
  costUsdMinor: number | null;
  retailPriceMinor: number | null;
  retailPriceManual: boolean;
  marginPercent: number | null;
  status: "active" | "disabled";
  available: boolean;
  published: boolean;
  topup: string;
  syncedAt: string;
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function planQuery(filters: PlanFilters): Record<string, unknown> {
  const query: Record<string, unknown> = { providerCode: { $not: /^fake/ } };
  if (filters.provider) query.providerCode = filters.provider;
  if (filters.scope) query["coverage.scope"] = filters.scope;
  if (filters.country) query["coverage.countries.code"] = filters.country.toUpperCase();
  if (filters.status) query.status = filters.status;
  if (filters.availability) query.available = filters.availability === "available";
  if (filters.productSlug) query.productSlug = filters.productSlug;
  if (filters.search?.trim()) {
    const pattern = new RegExp(escapeRegex(filters.search.trim()), "i");
    query.$or = [{ name: pattern }, { destination: pattern }, { providerPlanId: pattern }, { productSlug: pattern }];
  }
  return query;
}

const MARGIN = {
  $cond: [
    { $and: [{ $gt: ["$retailPriceMinor", 0] }, { $ne: ["$pricing", null] }] },
    { $divide: [{ $subtract: ["$retailPriceMinor", "$pricing.costUsdMinor"] }, "$retailPriceMinor"] },
    null,
  ],
};

function row(plan: IEsimPlan & { margin?: number | null }): AdminPlanRow {
  const perDay = plan.cost.billingUnit === "day";
  return {
    id: String(plan._id),
    name: plan.name,
    providerCode: plan.providerCode,
    productSlug: plan.productSlug,
    destination: plan.destination,
    scope: plan.coverage.scope,
    countryCount: plan.coverage.countries.length,
    data: plan.data.type === "unlimited" ? "Unlimited" : plan.data.label || `${plan.data.megabytes}MB`,
    dataType: plan.data.type,
    days: plan.duration.configurable ? `${plan.duration.minDays}–${plan.duration.maxDays}` : String(plan.validityDays),
    cost: { currency: plan.cost.currency, amountMinor: plan.cost.amountMinor, perDay },
    costUsdMinor: plan.pricing?.costUsdMinor ?? null,
    retailPriceMinor: plan.retailPriceMinor,
    retailPriceManual: plan.retailPriceManual,
    marginPercent: typeof plan.margin === "number" ? Math.round(plan.margin * 1000) / 10 : null,
    status: plan.status,
    available: plan.available,
    published: Boolean(plan.variantId),
    topup: plan.topup.supported ? plan.topup.mode : "none",
    syncedAt: new Date(plan.syncedAt).toISOString(),
  };
}

export async function listAdminPlans(
  filters: PlanFilters,
  options: { page?: number; pageSize?: number; sort?: PlanSort; order?: "asc" | "desc" } = {},
) {
  await connectDB();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, options.pageSize ?? 50));
  const direction = options.order === "desc" ? -1 : 1;
  const sortField = { name: "name", cost: "pricing.costUsdMinor", price: "retailPriceMinor", margin: "margin", updated: "syncedAt" }[options.sort ?? "name"];
  const match = planQuery(filters);
  const [result] = await EsimPlan.aggregate<{ rows: Array<IEsimPlan & { margin: number | null }>; total: Array<{ n: number }> }>([
    { $match: match },
    { $addFields: { margin: MARGIN } },
    {
      $facet: {
        rows: [
          { $sort: { [sortField]: direction, _id: 1 } },
          { $skip: (page - 1) * pageSize },
          { $limit: pageSize },
          { $project: { raw: 0 } },
        ],
        total: [{ $count: "n" }],
      },
    },
  ]);
  const total = result?.total[0]?.n ?? 0;
  return {
    rows: (result?.rows ?? []).map(row),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

/** Counts for the tabs and the header strip. */
export async function planStats() {
  await connectDB();
  const [stats] = await EsimPlan.aggregate<{ total: number; active: number; unavailable: number; unpriced: number; published: number }>([
    { $match: { providerCode: { $not: /^fake/ } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
        unavailable: { $sum: { $cond: ["$available", 0, 1] } },
        unpriced: { $sum: { $cond: [{ $eq: ["$retailPriceMinor", null] }, 1, 0] } },
        published: { $sum: { $cond: [{ $ne: ["$variantId", null] }, 1, 0] } },
      },
    },
  ]);
  return stats ?? { total: 0, active: 0, unavailable: 0, unpriced: 0, published: 0 };
}

/** The plans a bulk action covers: the ticked ones, or everything the filters match. */
export type PlanSelection = { ids: string[] } | { filters: PlanFilters };

function selectionQuery(selection: PlanSelection) {
  if ("ids" in selection) {
    return { _id: { $in: selection.ids.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id)) } };
  }
  return planQuery(selection.filters);
}

/**
 * Turns plans on or off. Turning on prices any that have no price yet.
 * Live products follow at the next publish, which `publishDestinations` runs.
 */
export async function setPlansStatus(selection: PlanSelection, status: "active" | "disabled") {
  await connectDB();
  const query = selectionQuery(selection);
  const affected = (await EsimPlan.distinct("productSlug", query)) as string[];
  const result = await EsimPlan.updateMany(query, { $set: { status } });
  const priced = status === "active" ? await repricePlans() : null;
  return { changed: result.modifiedCount, productSlugs: affected, priced: priced?.changed ?? 0 };
}

/** A hand-set selling price (USD minor units), or back to the pricing rules with null. */
export async function setManualPrice(planId: string, retailPriceMinor: number | null) {
  await connectDB();
  if (!mongoose.isValidObjectId(planId)) throw new Error("Unknown plan");
  const plan = await EsimPlan.findById(planId);
  if (!plan) throw new Error("Unknown plan");
  const before = { retailPriceMinor: plan.retailPriceMinor, retailPriceManual: plan.retailPriceManual };
  if (retailPriceMinor === null) {
    plan.retailPriceManual = false;
    await plan.save();
    await repricePlans({ providerCode: plan.providerCode });
  } else {
    plan.retailPriceMinor = Math.round(retailPriceMinor);
    plan.retailPriceManual = true;
    await plan.save();
  }
  const after = await EsimPlan.findById(planId).select({ retailPriceMinor: 1, retailPriceManual: 1, productSlug: 1 }).lean();
  return { before, after: { retailPriceMinor: after?.retailPriceMinor ?? null, retailPriceManual: after?.retailPriceManual ?? false }, productSlug: plan.productSlug };
}

/** The destinations (product slugs) a selection of plans belongs to. */
export async function selectionDestinations(selection: PlanSelection): Promise<string[]> {
  await connectDB();
  return EsimPlan.distinct("productSlug", selectionQuery(selection)) as Promise<string[]>;
}

/** Publishes the destinations the selection touches (new products as drafts unless `status`). */
export async function publishDestinations(selection: PlanSelection | { productSlugs: string[] }, status: "draft" | "active" = "draft") {
  await connectDB();
  const productSlugs = "productSlugs" in selection ? selection.productSlugs : await selectionDestinations(selection);
  if (!productSlugs.length) return { created: [], updated: [], unchanged: [], drafted: [] };
  return publishProducts({ productSlugs, status });
}
