import "server-only";

import type { AnyBulkWriteOperation } from "mongoose";
import { connectDB, mongoose } from "@/lib/db";
import { EsimPlan, type IEsimPlan } from "@/models/esim-plan.model";
import { EsimDestination } from "@/models/esim-destination.model";
import { EsimDestinationAlias } from "@/models/esim-destination-alias.model";
import { EsimProductLink, type IEsimProductLink } from "@/models/esim-product-link.model";
import { Product } from "@/models";
import { PRODUCT_STATUS } from "@/config/app.config";
import { destinationKey, mergedSlug } from "@/lib/esim/catalog/destination-key";

/**
 * Merging destinations (lib/esim/catalog/destination-key.ts says which
 * destination a plan is sold under). This side reads and writes the merges,
 * files the stored plans again when they change, moves a merged-away
 * destination's product and settings to where its plans went, and follows an
 * old address to its new one.
 */

/** The admin's merges: from → into. */
export async function destinationMerges(): Promise<Map<string, string>> {
  const rows = await EsimDestinationAlias.find({ kind: "manual" }).select({ from: 1, to: 1 }).lean();
  return new Map(rows.map((row) => [row.from, row.to]));
}

/**
 * Notes where a supplier's own slug went (`auto`), for old addresses and the
 * product move. Never replaces an admin's merge of the same slug.
 */
export async function recordAutoAliases(pairs: ReadonlyMap<string, string>): Promise<void> {
  for (const [from, to] of pairs) {
    if (!from || from === to) continue;
    const updated = await EsimDestinationAlias.updateOne({ from, kind: "auto", to: { $ne: to } }, { $set: { to } });
    if (updated.matchedCount) continue;
    await EsimDestinationAlias.updateOne({ from }, { $setOnInsert: { from, to, kind: "auto" } }, { upsert: true }).catch((error: { code?: number }) => {
      if (error?.code !== 11000) throw error;
    });
  }
}

type StoredPlan = Pick<IEsimPlan, "productSlug" | "supplierProductSlug" | "destination" | "coverage"> & { _id: mongoose.Types.ObjectId };

/**
 * Files every stored plan under the destination it belongs to now: after a
 * merge or its undo, and once for plans synced before plans were filed by
 * country. The destinations that gained or lost plans.
 */
export async function rekeyPlans(): Promise<string[]> {
  await connectDB();
  const merges = await destinationMerges();
  const touched = new Set<string>();
  const auto = new Map<string, string>();
  let writes: AnyBulkWriteOperation<IEsimPlan>[] = [];
  const flush = async () => {
    if (writes.length) await EsimPlan.bulkWrite(writes, { ordered: false });
    writes = [];
  };
  for await (const plan of EsimPlan.find({})
    .select({ productSlug: 1, supplierProductSlug: 1, destination: 1, coverage: 1 })
    .lean<StoredPlan[]>()
    .cursor()) {
    const supplierProductSlug = plan.supplierProductSlug || plan.productSlug;
    const own = destinationKey({ ...plan, supplierProductSlug });
    if (own.productSlug !== supplierProductSlug) auto.set(supplierProductSlug, own.productSlug);
    const next = destinationKey({ ...plan, supplierProductSlug }, merges);
    if (next.productSlug === plan.productSlug && next.destination === plan.destination && plan.supplierProductSlug) continue;
    if (next.productSlug !== plan.productSlug) touched.add(plan.productSlug).add(next.productSlug);
    writes.push({ updateOne: { filter: { _id: plan._id }, update: { $set: { productSlug: next.productSlug, destination: next.destination, supplierProductSlug } } } });
    if (writes.length >= 500) await flush();
  }
  await flush();
  await recordAutoAliases(auto);
  // An automatic note about a slug that is a destination again (its naming changed) no longer holds.
  const live = (await EsimPlan.distinct("productSlug")) as string[];
  await EsimDestinationAlias.deleteMany({ kind: "auto", from: { $in: live } });
  return [...touched];
}

/** Every slug that now points elsewhere, admin's and automatic: from → to. */
async function allAliases(): Promise<Map<string, string>> {
  const rows = await EsimDestinationAlias.find({}).select({ from: 1, to: 1 }).lean();
  return new Map(rows.map((row) => [row.from, row.to]));
}

/** Where an old destination slug ("china-mainland-esim") is sold now, or null when it has not moved. */
export async function resolveDestinationAlias(productSlug: string): Promise<string | null> {
  await connectDB();
  const aliases = await allAliases();
  if (!aliases.has(productSlug)) return null;
  const target = mergedSlug(productSlug, aliases);
  return target === productSlug ? null : target;
}

/**
 * Publishing a destination that has no product yet: the product of a
 * destination merged into it moves over (its link renamed), when that one has
 * no plans of its own left, so the product, its status and its reviews carry
 * over instead of a new draft. Its admin settings (featured, names, pins) come
 * along when the destination has none. The moved link, or null.
 */
export async function adoptMergedLink(productSlug: string): Promise<(mongoose.HydratedDocument<IEsimProductLink>) | null> {
  const aliases = await allAliases();
  const sources = [...aliases.keys()].filter((from) => from !== productSlug && mergedSlug(from, aliases) === productSlug);
  if (!sources.length) return null;
  const links = await EsimProductLink.find({ productSlug: { $in: sources } });
  if (!links.length) return null;
  const products = await Product.find({ _id: { $in: links.map((link) => link.product) } }).select({ status: 1 }).lean<Array<{ _id: mongoose.Types.ObjectId; status: string }>>();
  const active = new Set(products.filter((product) => product.status === PRODUCT_STATUS.ACTIVE).map((product) => String(product._id)));
  const ranked = [...links].sort((a, b) => Number(active.has(String(b.product))) - Number(active.has(String(a.product))) || b.variants.length - a.variants.length);
  for (const link of ranked) {
    if (await EsimPlan.exists({ productSlug: link.productSlug })) continue;
    const from = link.productSlug;
    link.productSlug = productSlug;
    await link.save();
    if (!(await EsimDestination.exists({ productSlug }))) {
      await EsimDestination.updateOne({ productSlug: from }, { $set: { productSlug } });
    }
    return link;
  }
  return null;
}

export class MergeError extends Error {}

/** The destinations a merge can go into, for the admin's picker: slug and name, most plans first. */
export async function mergeTargets(except: string): Promise<Array<{ productSlug: string; name: string; scope: string; plans: number }>> {
  await connectDB();
  const rows = await EsimPlan.aggregate<{ _id: string; name: string; scope: string; plans: number }>([
    { $match: { productSlug: { $ne: except } } },
    { $group: { _id: "$productSlug", name: { $first: "$destination" }, scope: { $first: "$coverage.scope" }, plans: { $sum: 1 } } },
    { $sort: { name: 1 } },
  ]);
  return rows.map((row) => ({ productSlug: row._id, name: row.name, scope: row.scope, plans: row.plans }));
}

/** The destinations an admin merged into this one, for undoing. */
export async function mergedInto(productSlug: string): Promise<string[]> {
  await connectDB();
  const rows = await EsimDestinationAlias.find({ kind: "manual", to: productSlug }).select({ from: 1 }).sort({ from: 1 }).lean();
  return rows.map((row) => row.from);
}

/**
 * An admin merges `from` into `into`: its plans are sold under `into` from now
 * on, including plans a supplier adds later. The destinations whose plans
 * moved, to publish.
 */
export async function mergeDestination(from: string, into: string): Promise<string[]> {
  await connectDB();
  if (from === into) throw new MergeError("A destination cannot be merged into itself");
  const [fromPlans, intoPlans] = await Promise.all([EsimPlan.exists({ productSlug: from }), EsimPlan.exists({ productSlug: into })]);
  if (!fromPlans) throw new MergeError("Unknown destination");
  if (!intoPlans) throw new MergeError("The destination to merge into has no plans");
  const merges = await destinationMerges();
  merges.set(from, into);
  if (mergedSlug(into, merges) !== into) throw new MergeError("That destination is itself merged into another");
  await EsimDestinationAlias.updateOne({ from }, { $set: { to: into, kind: "manual" } }, { upsert: true });
  return [...new Set([from, into, ...(await rekeyPlans())])];
}

/** Undoes an admin's merge: `from`'s plans go back under their own destination. The destinations to publish. */
export async function unmergeDestination(from: string): Promise<string[]> {
  await connectDB();
  const alias = await EsimDestinationAlias.findOneAndDelete({ from, kind: "manual" }).lean();
  if (!alias) throw new MergeError("That destination is not merged");
  return [...new Set([from, alias.to, ...(await rekeyPlans())])];
}
