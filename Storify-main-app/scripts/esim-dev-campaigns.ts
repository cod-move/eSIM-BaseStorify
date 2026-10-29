/**
 * End-to-end check of eSIM campaigns (CAT-11, WEB-19) against a development
 * database. Needs the sample destination from scripts/esim-dev-storefront.ts.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-campaigns.ts
 *
 * A draft campaign makes a coupon that is switched off; activated, the
 * coupon runs for the campaign's dates on the destination's product only —
 * checked with Storify's own coupon calculation — and the campaign shows on
 * that destination and not on others. A code another coupon uses and a
 * destination not on sale are refused. Removing a campaign switches its
 * coupon off. Removes what it made and reports any collection whose count
 * changed, apart from the audit log. Refuses to run with NODE_ENV=production.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { Coupon, CouponStatus, CouponType } from "@/models/coupon.model";
import { EsimCampaign } from "@/models/esim-campaign.model";

const tag = `E2E${Date.now().toString(36).toUpperCase()}`;
const made = { campaigns: [] as string[], coupons: [] as mongoose.Types.ObjectId[] };

async function counts() {
  const db = mongoose.connection.db!;
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  return new Map(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const)));
}

async function run() {
  const { saveCampaign, deleteCampaign, campaignForPage, liveCampaigns, CampaignError } = await import("@/lib/esim/campaigns/service");
  const { listDestinations } = await import("@/lib/esim/storefront/catalog");
  const { validateAndCalculateCoupon } = await import("@/lib/catalog/coupons");
  const destination = (await listDestinations()).find((entry) => entry.slug === "dev-europe");
  assert.ok(destination, "run scripts/esim-dev-storefront.ts first: the dev-europe sample destination is needed");

  const now = Date.now();
  const input = {
    slug: tag.toLowerCase(),
    name: "E2E summer offer",
    headline: "Europe for less",
    description: "",
    imageUrl: null,
    seoTitle: null,
    seoDescription: null,
    destinations: ["dev-europe"],
    discountPercent: 20,
    couponCode: tag,
    startsAt: new Date(now - 3_600_000),
    endsAt: new Date(now + 86_400_000),
    status: "draft" as const,
  };

  console.log("1. a draft makes a coupon that does not work yet");
  const draft = await saveCampaign(input, { actor: "e2e" });
  made.campaigns.push(draft.id);
  const stored = await EsimCampaign.findById(draft.id).lean();
  made.coupons.push(stored!.coupon!);
  let coupon = await Coupon.findById(stored!.coupon).lean();
  assert.equal(coupon?.code, tag);
  assert.equal(coupon?.status, CouponStatus.INACTIVE);
  assert.equal(coupon?.type, CouponType.PERCENTAGE);
  assert.deepEqual(coupon?.applicableProducts?.map(String), [destination.productId]);
  assert.equal(draft.state, "draft");
  assert.equal((await liveCampaigns()).some((campaign) => campaign.slug === input.slug), false);

  console.log("2. active: the code takes 20% off the destination's eSIMs only, and the banner shows there");
  const live = await saveCampaign({ ...input, status: "active" }, { id: draft.id });
  assert.equal(live.state, "live");
  coupon = await Coupon.findById(stored!.coupon).lean();
  assert.equal(coupon?.status, CouponStatus.ACTIVE);
  assert.equal(coupon?.listed, true);
  const other = new mongoose.Types.ObjectId().toString();
  const result = await validateAndCalculateCoupon({
    code: tag.toLowerCase(),
    subtotal: 30,
    cartItems: [
      { productId: destination.productId, price: 10, quantity: 1 },
      { productId: other, price: 20, quantity: 1 },
    ],
  });
  assert.equal(result.discount, 2, "20% of the 10.00 eSIM, nothing off the other line");
  // The storefront reads through a cache; outside Next.js it is read afresh.
  assert.equal((await campaignForPage("dev-europe"))?.slug, input.slug);
  assert.equal(await campaignForPage("no-such-destination"), null);

  console.log("3. refused: a code another coupon uses, a destination not on sale, an end before the start");
  const clash = await Coupon.create({ code: `${tag}X`, type: CouponType.PERCENTAGE, value: 5, status: CouponStatus.ACTIVE, startDate: new Date(), endDate: new Date(now + 86_400_000), createdBy: "e2e" });
  made.coupons.push(clash._id as mongoose.Types.ObjectId);
  await assert.rejects(saveCampaign({ ...input, slug: `${input.slug}-2`, couponCode: `${tag}X` }), CampaignError);
  await assert.rejects(saveCampaign({ ...input, slug: `${input.slug}-3`, couponCode: `${tag}Y`, destinations: ["atlantis"] }), /Not on sale: atlantis/);
  await assert.rejects(saveCampaign({ ...input, couponCode: `${tag}Z` }), /Another campaign uses this address/);
  const { CampaignInputSchema } = await import("@/lib/esim/campaigns/rules");
  assert.equal(CampaignInputSchema.safeParse({ ...input, endsAt: input.startsAt }).success, false);

  console.log("4. removed: the coupon is switched off and kept");
  await deleteCampaign(draft.id);
  made.campaigns.length = 0;
  coupon = await Coupon.findById(stored!.coupon).lean();
  assert.equal(coupon?.status, CouponStatus.INACTIVE);
  console.log("All campaign checks passed.");
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against production");
  await connectDB();
  const before = await counts();
  try {
    await run();
  } finally {
    await EsimCampaign.deleteMany({ _id: { $in: made.campaigns } });
    await Coupon.deleteMany({ _id: { $in: made.coupons } });
    const after = await counts();
    const changed = [...after].filter(([name, count]) => name !== "audit_logs" && (before.get(name) ?? 0) !== count);
    console.log(changed.length ? `Collections changed: ${JSON.stringify(changed)}` : "Cleanup left every collection as it was.");
    await disconnectDB();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
