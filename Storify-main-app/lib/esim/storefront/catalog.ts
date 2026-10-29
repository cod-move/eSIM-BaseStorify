import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";
import { afterResponse } from "@/lib/after-response";
import { mongoose, connectDB } from "@/lib/db";
import { PRODUCT_STATUS } from "@/config/app.config";
import { Product } from "@/models";
import { EsimPlan, type IEsimPlan } from "@/models/esim-plan.model";
import { EsimProductLink } from "@/models/esim-product-link.model";
import { EsimProfile } from "@/models/esim-profile.model";
import { EsimDestination } from "@/models/esim-destination.model";
import { continentOf, type Continent } from "@/lib/esim/storefront/continents";
import { fromPriceMinor, type StorefrontVariant } from "@/lib/esim/storefront/selector";
import { supportsScheduledActivation } from "@/lib/esim/providers/registry";
import { summarizeFacts } from "@/lib/esim/storefront/product-facts";
import type { CoverageScope } from "@/lib/esim/providers/types";

/**
 * What the destination pages show (WEB-30..33): the published eSIM products,
 * one per destination, with each variant described by its primary plan.
 *
 * Only products an admin has made active are listed. Read through a 5-minute
 * cache tagged `esim-storefront`, which publishing clears.
 */

export const STOREFRONT_TAG = "esim-storefront";

export interface Destination {
  /** URL slug: the catalogue's product slug without "-esim" ("japan", "europe-35-areas"). */
  slug: string;
  name: string;
  emoji: string | null;
  scope: CoverageScope;
  /** Filed under, for a single-country destination. */
  continent: Continent | null;
  countries: Array<{ code: string; name: string }>;
  productId: string;
  /** The Storify product's own slug, for its product page. */
  productHandle: string;
  fromPriceMinor: number | null;
  variantCount: number;
}

export interface DestinationDetail extends Destination {
  variants: StorefrontVariant[];
  /** Operators by country, from the plans that would fulfil the variants. */
  networks: Array<{ countryCode: string; operator: string; network: string | null }>;
  image: string | null;
  updatedAt: string;
}

const urlSlug = (productSlug: string) => productSlug.replace(/-esim$/, "");

/**
 * The path a destination lives at: a country at `/esim/japan`, a region at
 * `/esim/region/europe-35-areas`, the global plan at `/esim/global` (WEB-33).
 */
export function destinationPath(destination: Pick<Destination, "slug" | "scope">): string {
  if (destination.scope === "local") return `/esim/${destination.slug}`;
  if (destination.scope === "global" && destination.slug === "global") return "/esim/global";
  return `/esim/region/${destination.slug}`;
}

type PlanFacts = Pick<
  IEsimPlan,
  "destination" | "emoji" | "coverage" | "data" | "validityDays" | "topup" | "supplierNetworks"
> & { _id: mongoose.Types.ObjectId };

/** A plan's operators: the catalogue's, else those fetched on their own (CAT-10). */
const networksOfPlan = (plan: Pick<IEsimPlan, "coverage" | "supplierNetworks">) =>
  plan.coverage.networks.length ? plan.coverage.networks : (plan.supplierNetworks?.list ?? []);

async function readCatalog(): Promise<DestinationDetail[]> {
  await connectDB();
  const links = await EsimProductLink.find({}).lean();
  if (!links.length) return [];
  const products = await Product.find({ _id: { $in: links.map((link) => link.product) }, status: PRODUCT_STATUS.ACTIVE })
    .select({ slug: 1, images: 1, media: 1, updatedAt: 1 })
    .lean<Array<{ _id: mongoose.Types.ObjectId; slug: string; images?: string[]; media?: Array<{ url: string }>; updatedAt?: Date }>>();
  const productById = new Map(products.map((product) => [String(product._id), product]));
  const primaryIds = links.flatMap((link) =>
    productById.has(String(link.product)) ? link.variants.map((variant) => variant.candidates[0]).filter(Boolean) : [],
  );
  const plans = await EsimPlan.find({ _id: { $in: primaryIds } })
    .select({ destination: 1, emoji: 1, coverage: 1, data: 1, validityDays: 1, topup: 1, supplierNetworks: 1 })
    .lean<PlanFacts[]>();
  const planById = new Map(plans.map((plan) => [String(plan._id), plan]));
  // ORD-03: a variant takes a start date when every plan behind it comes from a supplier that schedules.
  const candidateIds = links.flatMap((link) => (productById.has(String(link.product)) ? link.variants.flatMap((variant) => variant.candidates) : []));
  const providerOf = new Map(
    (await EsimPlan.find({ _id: { $in: candidateIds } }).select({ providerCode: 1 }).lean<Array<{ _id: mongoose.Types.ObjectId; providerCode: string }>>())
      .map((plan) => [String(plan._id), plan.providerCode]),
  );
  const scheduled = (candidates: unknown[]) =>
    candidates.length > 0 && candidates.every((id) => {
      const code = providerOf.get(String(id));
      return code !== undefined && supportsScheduledActivation(code);
    });

  const result: DestinationDetail[] = [];
  for (const link of links) {
    const product = productById.get(String(link.product));
    if (!product) continue;
    const variants: StorefrontVariant[] = [];
    const countries = new Map<string, string>();
    const networks = new Map<string, { countryCode: string; operator: string; network: string | null }>();
    const scopes = new Map<CoverageScope, number>();
    let first: PlanFacts | undefined;
    for (const variant of link.variants) {
      const plan = planById.get(String(variant.candidates[0]));
      if (!plan) continue;
      first ??= plan;
      scopes.set(plan.coverage.scope, (scopes.get(plan.coverage.scope) ?? 0) + 1);
      for (const country of plan.coverage.countries) countries.set(country.code, country.name);
      for (const network of networksOfPlan(plan)) {
        networks.set(`${network.countryCode}|${network.operator}|${network.network ?? ""}`, network);
      }
      const cut = variant.name.lastIndexOf(" / ");
      variants.push({
        variantId: String(variant.variantId),
        name: variant.name,
        priceMinor: variant.priceMinor,
        dataType: plan.data.type,
        megabytes: plan.data.megabytes,
        dataValue: cut === -1 ? variant.name : variant.name.slice(0, cut),
        days: variant.perDay ? null : plan.validityDays,
        perDay: variant.perDay ?? null,
        topupMode: plan.topup.supported ? plan.topup.mode : "none",
        breakoutIp: plan.coverage.breakoutIp ?? [],
        scheduledActivation: scheduled(variant.candidates),
      });
    }
    if (!first || !variants.length) continue;
    const scope = [...scopes].sort((a, b) => b[1] - a[1])[0][0];
    const countryList = [...countries].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
    result.push({
      slug: urlSlug(link.productSlug),
      name: first.destination,
      emoji: first.emoji ?? null,
      scope,
      continent: scope === "local" ? continentOf(countryList[0]?.code) : null,
      countries: countryList,
      productId: String(product._id),
      productHandle: product.slug,
      fromPriceMinor: fromPriceMinor(variants),
      variantCount: variants.length,
      variants,
      networks: [...networks.values()].sort((a, b) => a.countryCode.localeCompare(b.countryCode) || a.operator.localeCompare(b.operator)),
      image: product.images?.[0] ?? product.media?.[0]?.url ?? null,
      updatedAt: (product.updatedAt ?? link.publishedAt ?? new Date()).toISOString(),
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

const cachedCatalog = unstable_cache(readCatalog, ["esim-storefront-catalog"], {
  revalidate: 300,
  tags: [STOREFRONT_TAG],
});

/** Every listed destination, without its variants. */
export async function listDestinations(): Promise<Destination[]> {
  return (await cachedCatalog()).map(({ variants: _variants, networks: _networks, image: _image, updatedAt: _updatedAt, ...destination }) => destination);
}

/** One destination with its variants; `scope` keeps a country page from serving a region and back. */
export async function getDestination(slug: string, scope: "local" | "multi"): Promise<DestinationDetail | null> {
  const destination = (await cachedCatalog()).find((entry) => entry.slug === slug);
  if (!destination) return null;
  if (scope === "local" ? destination.scope !== "local" : destination.scope === "local") return null;
  return destination;
}

/** The global destinations, cheapest first. */
export async function globalDestinations(): Promise<DestinationDetail[]> {
  return (await cachedCatalog())
    .filter((destination) => destination.scope === "global")
    .sort((a, b) => (a.fromPriceMinor ?? Infinity) - (b.fromPriceMinor ?? Infinity));
}

/** Paths and last change of every listed destination and running campaign (CAT-11), for the sitemap. */
export async function destinationSitemap(): Promise<Array<{ path: string; updatedAt: string }>> {
  const destinations = (await cachedCatalog()).map((destination) => ({ path: destinationPath(destination), updatedAt: destination.updatedAt }));
  // Imported here: the campaigns read the catalogue themselves.
  const { campaignSitemap } = await import("@/lib/esim/campaigns/service");
  return [...destinations, ...(await campaignSitemap())];
}

/** A destination as the client components take it (`components/esim/destination-card.tsx`). */
export function toBrowserDestination(destination: Destination) {
  return {
    slug: destination.slug,
    name: destination.name,
    emoji: destination.emoji,
    scope: destination.scope,
    continent: destination.continent,
    countryNames: destination.countries.map((country) => country.name),
    countryCodes: destination.countries.map((country) => country.code),
    path: destinationPath(destination),
    fromPriceMinor: destination.fromPriceMinor,
  };
}

async function readFeatured(): Promise<string[]> {
  await connectDB();
  const rows = await EsimDestination.find({ featured: true }).select({ productSlug: 1 }).lean();
  return rows.map((row) => urlSlug(row.productSlug));
}

const cachedFeatured = unstable_cache(readFeatured, ["esim-storefront-featured"], { revalidate: 300, tags: [STOREFRONT_TAG] });

async function readPopularity(): Promise<Array<[string, number]>> {
  await connectDB();
  const since = new Date(Date.now() - 90 * 86_400_000);
  const byPlan = await EsimProfile.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    { $match: { status: "fulfilled", fulfilledAt: { $gte: since } } },
    { $group: { _id: "$plan", count: { $sum: 1 } } },
  ]);
  const plans = await EsimPlan.find({ _id: { $in: byPlan.map((row) => row._id) } })
    .select({ productSlug: 1 })
    .lean<Array<{ _id: mongoose.Types.ObjectId; productSlug: string }>>();
  const slugOf = new Map(plans.map((plan) => [String(plan._id), urlSlug(plan.productSlug)]));
  const counts = new Map<string, number>();
  for (const row of byPlan) {
    const slug = slugOf.get(String(row._id));
    if (slug) counts.set(slug, (counts.get(slug) ?? 0) + row.count);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}

const cachedPopularity = unstable_cache(readPopularity, ["esim-storefront-popularity"], {
  revalidate: 3600,
  tags: [STOREFRONT_TAG],
});

/**
 * The destinations an admin featured (ADM-02), then the best sellers of the
 * last 90 days (WEB-11 "auto"), then the rest by name — a new store with no
 * sales still shows a full grid.
 */
export async function popularDestinations(limit: number, scope?: CoverageScope): Promise<Destination[]> {
  const [all, ranking, featured] = await Promise.all([listDestinations(), cachedPopularity(), cachedFeatured()]);
  const rank = new Map(ranking.map(([slug], index) => [slug, index]));
  const pinned = new Set(featured);
  return all
    .filter((destination) => !scope || destination.scope === scope)
    .sort(
      (a, b) =>
        Number(pinned.has(b.slug)) - Number(pinned.has(a.slug)) ||
        (rank.get(a.slug) ?? Infinity) - (rank.get(b.slug) ?? Infinity) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}

/** The listed destinations among these slugs, in the order given. */
export async function destinationsBySlug(slugs: string[]): Promise<Destination[]> {
  const all = new Map((await listDestinations()).map((destination) => [destination.slug, destination]));
  return slugs.map((slug) => all.get(slug.trim().toLowerCase().replace(/-esim$/, ""))).filter((entry): entry is Destination => Boolean(entry));
}

/**
 * Names of the destination's exit-IP countries in the page's language, made
 * on the server so the plan selector renders the same text on both sides.
 */
export function regionNamesFor(destination: Pick<DestinationDetail, "variants">, locale: string): Record<string, string> {
  const names = new Intl.DisplayNames([locale, "en"], { type: "region" });
  return Object.fromEntries(
    [...new Set(destination.variants.flatMap((variant) => variant.breakoutIp))].map((code) => {
      try {
        return [code, names.of(code) ?? code];
      } catch {
        return [code, code];
      }
    }),
  );
}

/**
 * The eSIM facts of a store product (WEB-34): read from the plans that would
 * fulfil its variants — the primary of each, as the shopper would get. Null
 * for a product that is not an eSIM.
 */
export async function productEsimFacts(productId: string) {
  if (!mongoose.isValidObjectId(productId)) return null;
  return unstable_cache(
    async () => {
      await connectDB();
      const link = await EsimProductLink.findOne({ product: new mongoose.Types.ObjectId(productId) }).select({ variants: 1 }).lean();
      if (!link) return null;
      const plans = await EsimPlan.find({ _id: { $in: link.variants.map((variant) => variant.candidates[0]).filter(Boolean) } })
        .select({ coverage: 1, data: 1, speed: 1, tethering: 1, activation: 1, topup: 1, bundles: 1, extras: 1, supplierNetworks: 1 })
        .lean<IEsimPlan[]>();
      return summarizeFacts(
        plans.map((plan) => ({
          scope: plan.coverage.scope,
          countries: plan.coverage.countries,
          networks: networksOfPlan(plan),
          breakoutIp: plan.coverage.breakoutIp ?? [],
          dataType: plan.data.type,
          speed: plan.speed ?? [],
          tethering: plan.tethering ?? null,
          billingStarts: plan.activation?.billingStarts ?? null,
          preInstallDays: plan.activation?.preInstallDays ?? null,
          topupMode: plan.topup.supported ? plan.topup.mode : "none",
          vpn: (plan.bundles ?? []).some((bundle) => bundle.type === "vpn"),
          voiceMinutes: plan.extras?.voiceMinutes ?? 0,
          smsCount: plan.extras?.smsCount ?? 0,
        })),
      );
    },
    ["esim-product-facts", productId],
    { revalidate: 300, tags: [STOREFRONT_TAG] },
  )();
}

/**
 * After a destination page is sent (CAT-10): when some covered country has no
 * operator, ask the suppliers that can say, and refresh the storefront's cache
 * if any answered. Never delays the page.
 */
export function refreshMissingNetworks(destination: Pick<DestinationDetail, "productId" | "countries" | "networks">) {
  const covered = new Set(destination.networks.map((network) => network.countryCode));
  if (destination.countries.every((country) => covered.has(country.code))) return;
  afterResponse(async () => {
    const link = await EsimProductLink.findOne({ product: new mongoose.Types.ObjectId(destination.productId) }).select({ variants: 1 }).lean();
    if (!link) return;
    const { fillMissingNetworks } = await import("@/lib/esim/catalog/networks");
    const gained = await fillMissingNetworks(link.variants.map((variant) => variant.candidates[0]).filter(Boolean));
    if (!gained) return;
    try {
      revalidateTag(STOREFRONT_TAG, { expire: 0 });
    } catch {
      // Not allowed from where this ran: the cache lapses within minutes.
    }
  });
}
