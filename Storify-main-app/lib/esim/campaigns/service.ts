import "server-only";

import { unstable_cache, revalidateTag } from "next/cache";
import { connectDB, mongoose } from "@/lib/db";
import { revalidateCouponContent } from "@/lib/cache-invalidation";
import { Coupon, CouponStatus, CouponType } from "@/models/coupon.model";
import { EsimCampaign, type IEsimCampaign } from "@/models/esim-campaign.model";
import { STOREFRONT_TAG, destinationsBySlug, type Destination } from "@/lib/esim/storefront/catalog";
import { campaignFor, campaignState, type CampaignInput, type CampaignState } from "@/lib/esim/campaigns/rules";

/**
 * eSIM campaigns (CAT-11) and their Storify coupons.
 *
 * Saving a campaign writes its coupon too: the code, the percentage, the
 * dates, and `applicableProducts` set to the destinations' products, so
 * Storify's checkout gives the discount on those eSIMs only. The coupon is
 * active only while the campaign is; it is never deleted (orders name it),
 * just switched off with the campaign. A code another coupon already uses is
 * refused.
 */

export class CampaignError extends Error {}

export interface CampaignView {
  id: string;
  slug: string;
  name: string;
  headline: string;
  description: string;
  imageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  destinations: string[];
  discountPercent: number;
  couponCode: string;
  startsAt: string;
  endsAt: string;
  status: "draft" | "active";
  state: CampaignState;
  /** Times the code was used, from the coupon. */
  used: number;
}

function view(campaign: IEsimCampaign, used = 0): CampaignView {
  return {
    id: String(campaign._id),
    slug: campaign.slug,
    name: campaign.name,
    headline: campaign.headline,
    description: campaign.description,
    imageUrl: campaign.imageUrl,
    seoTitle: campaign.seo?.title ?? null,
    seoDescription: campaign.seo?.description ?? null,
    destinations: campaign.destinations,
    discountPercent: campaign.discountPercent,
    couponCode: campaign.couponCode,
    startsAt: new Date(campaign.startsAt).toISOString(),
    endsAt: new Date(campaign.endsAt).toISOString(),
    status: campaign.status,
    state: campaignState(campaign),
    used,
  };
}

export async function listCampaigns(): Promise<CampaignView[]> {
  await connectDB();
  const campaigns = await EsimCampaign.find({}).sort({ startsAt: -1 }).lean<IEsimCampaign[]>();
  const coupons = await Coupon.find({ _id: { $in: campaigns.map((campaign) => campaign.coupon).filter(Boolean) } })
    .select({ usedCount: 1 })
    .lean<Array<{ _id: mongoose.Types.ObjectId; usedCount?: number }>>();
  const used = new Map(coupons.map((coupon) => [String(coupon._id), coupon.usedCount ?? 0]));
  return campaigns.map((campaign) => view(campaign, used.get(String(campaign.coupon)) ?? 0));
}

function refreshStorefront() {
  revalidateCouponContent();
  try {
    revalidateTag(STOREFRONT_TAG, { expire: 0 });
  } catch {
    // Outside a request (a script): the cache lapses within minutes.
  }
}

/** Creates (no `id`) or updates a campaign, and its coupon. */
export async function saveCampaign(input: CampaignInput, options: { id?: string; actor?: string } = {}): Promise<CampaignView> {
  await connectDB();
  const existing = options.id
    ? mongoose.isValidObjectId(options.id) ? await EsimCampaign.findById(options.id) : null
    : null;
  if (options.id && !existing) throw new CampaignError("Unknown campaign");
  if (await EsimCampaign.exists({ slug: input.slug, ...(existing ? { _id: { $ne: existing._id } } : {}) })) {
    throw new CampaignError("Another campaign uses this address");
  }
  const destinations = await destinationsBySlug(input.destinations);
  const missing = input.destinations.filter((slug) => !destinations.some((destination) => destination.slug === slug));
  if (missing.length) throw new CampaignError(`Not on sale: ${missing.join(", ")}`);
  const clash = await Coupon.findOne({ code: input.couponCode, ...(existing?.coupon ? { _id: { $ne: existing.coupon } } : {}) })
    .select({ _id: 1 })
    .lean();
  if (clash) throw new CampaignError("Another coupon already uses this code");

  const campaign = existing ?? new EsimCampaign({ createdBy: options.actor ?? null });
  campaign.set({
    slug: input.slug,
    name: input.name,
    headline: input.headline,
    description: input.description,
    imageUrl: input.imageUrl,
    seo: { title: input.seoTitle, description: input.seoDescription },
    destinations: destinations.map((destination) => destination.slug),
    discountPercent: input.discountPercent,
    couponCode: input.couponCode,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    status: input.status,
  });
  const couponFields = {
    code: input.couponCode,
    label: input.name.slice(0, 80),
    description: `eSIM campaign: ${input.name}`.slice(0, 200),
    type: CouponType.PERCENTAGE,
    value: input.discountPercent,
    startDate: input.startsAt,
    endDate: input.endsAt,
    status: input.status === "active" ? CouponStatus.ACTIVE : CouponStatus.INACTIVE,
    applicableProducts: destinations.map((destination) => new mongoose.Types.ObjectId(destination.productId)),
    fundedBy: "platform" as const,
    // Shown in the shopper app's coupon list while it runs.
    listed: input.status === "active",
  };
  if (campaign.coupon) {
    await Coupon.updateOne({ _id: campaign.coupon }, { $set: couponFields });
  } else {
    const coupon = await Coupon.create({ ...couponFields, createdBy: "esim-campaign" });
    campaign.coupon = coupon._id as mongoose.Types.ObjectId;
  }
  await campaign.save();
  refreshStorefront();
  return view(campaign);
}

/** Removes a campaign; its coupon is switched off and kept for the orders that used it. */
export async function deleteCampaign(id: string) {
  await connectDB();
  const campaign = mongoose.isValidObjectId(id) ? await EsimCampaign.findById(id) : null;
  if (!campaign) throw new CampaignError("Unknown campaign");
  if (campaign.coupon) await Coupon.updateOne({ _id: campaign.coupon }, { $set: { status: CouponStatus.INACTIVE, listed: false } });
  await campaign.deleteOne();
  refreshStorefront();
  return view(campaign);
}

// ---------------------------------------------------------------------------
// Storefront (WEB-19): the campaigns running now, cached with the catalogue.
// ---------------------------------------------------------------------------

export interface LiveCampaign {
  slug: string;
  name: string;
  headline: string;
  description: string;
  imageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  destinations: string[];
  discountPercent: number;
  couponCode: string;
  startsAt: string;
  endsAt: string;
}

/** Active campaigns not over yet; each caller keeps only those started (the cache can be minutes old). */
const cachedCampaigns = unstable_cache(
  async (): Promise<LiveCampaign[]> => {
    await connectDB();
    const campaigns = await EsimCampaign.find({ status: "active", endsAt: { $gt: new Date() } }).lean<IEsimCampaign[]>();
    return campaigns.map((campaign) => {
      const shown = view(campaign);
      return {
        slug: shown.slug,
        name: shown.name,
        headline: shown.headline,
        description: shown.description,
        imageUrl: shown.imageUrl,
        seoTitle: shown.seoTitle,
        seoDescription: shown.seoDescription,
        destinations: shown.destinations,
        discountPercent: shown.discountPercent,
        couponCode: shown.couponCode,
        startsAt: shown.startsAt,
        endsAt: shown.endsAt,
      };
    });
  },
  ["esim-storefront-campaigns"],
  { revalidate: 300, tags: [STOREFRONT_TAG] },
);

export async function liveCampaigns(now = new Date()): Promise<LiveCampaign[]> {
  return (await cachedCampaigns()).filter((campaign) => new Date(campaign.startsAt) <= now && now < new Date(campaign.endsAt));
}

/** The campaign to show on a destination's page, or on the overview when no destination is given. */
export async function campaignForPage(destinationSlug?: string): Promise<LiveCampaign | null> {
  const live = (await liveCampaigns()).map((campaign) => ({ ...campaign, endsAt: new Date(campaign.endsAt) }));
  const chosen = campaignFor(live, destinationSlug);
  return chosen ? { ...chosen, endsAt: chosen.endsAt.toISOString() } : null;
}

/** A running campaign with its destinations, for its page; null when it is not running. */
export async function getLiveCampaign(slug: string): Promise<{ campaign: LiveCampaign; destinations: Destination[] } | null> {
  const campaign = (await liveCampaigns()).find((entry) => entry.slug === slug);
  if (!campaign) return null;
  return { campaign, destinations: await destinationsBySlug(campaign.destinations) };
}

/** Running campaigns' pages, for the sitemap. */
export async function campaignSitemap(): Promise<Array<{ path: string; updatedAt: string }>> {
  return (await liveCampaigns()).map((campaign) => ({ path: `/esim/campaign/${campaign.slug}`, updatedAt: campaign.startsAt }));
}

/** What the banner shows, with the end date written out here so server and browser agree. Days are UTC. */
export function bannerData(campaign: LiveCampaign, locale: string) {
  const endsLabel = `${new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(campaign.endsAt))} UTC`;
  return {
    slug: campaign.slug,
    name: campaign.name,
    headline: campaign.headline,
    imageUrl: campaign.imageUrl,
    discountPercent: campaign.discountPercent,
    couponCode: campaign.couponCode,
    endsLabel,
  };
}
