import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CampaignInputSchema, campaignFor, campaignPriceMinor, campaignState } from "../rules";

const at = (iso: string) => new Date(iso);

describe("campaignState", () => {
  const campaign = { status: "active", startsAt: at("2026-11-01T00:00:00Z"), endsAt: at("2026-11-15T00:00:00Z") };

  it("follows the dates while active", () => {
    assert.equal(campaignState(campaign, at("2026-10-31T23:59:59Z")), "scheduled");
    assert.equal(campaignState(campaign, at("2026-11-01T00:00:00Z")), "live");
    assert.equal(campaignState(campaign, at("2026-11-15T00:00:00Z")), "ended");
    assert.equal(campaignState({ ...campaign, status: "draft" }, at("2026-11-05T00:00:00Z")), "draft");
  });
});

describe("campaignPriceMinor", () => {
  it("takes the percentage off, keeping the odd cent", () => {
    assert.equal(campaignPriceMinor(1000, 20), 800);
    assert.equal(campaignPriceMinor(999, 15), 850);
  });
});

describe("campaignFor", () => {
  const campaigns = [
    { slug: "a", destinations: ["japan"], discountPercent: 10, endsAt: at("2026-11-10T00:00:00Z") },
    { slug: "b", destinations: ["japan", "korea"], discountPercent: 15, endsAt: at("2026-11-20T00:00:00Z") },
    { slug: "c", destinations: ["korea"], discountPercent: 15, endsAt: at("2026-11-12T00:00:00Z") },
  ];

  it("picks the biggest discount covering the destination, then the soonest to end", () => {
    assert.equal(campaignFor(campaigns, "japan")?.slug, "b");
    assert.equal(campaignFor(campaigns, "korea")?.slug, "c");
    assert.equal(campaignFor(campaigns, "france"), null);
    assert.equal(campaignFor(campaigns)?.slug, "c");
  });
});

describe("CampaignInputSchema", () => {
  const input = {
    slug: "Summer-Deals",
    name: "Summer",
    destinations: ["japan"],
    discountPercent: 20,
    couponCode: "summer20",
    startsAt: "2026-11-01T00:00:00Z",
    endsAt: "2026-11-15T00:00:00Z",
    status: "active",
  };

  it("normalises the address and the code", () => {
    const parsed = CampaignInputSchema.parse(input);
    assert.equal(parsed.slug, "summer-deals");
    assert.equal(parsed.couponCode, "SUMMER20");
  });

  it("refuses no destinations, a bad code and an end before the start", () => {
    assert.equal(CampaignInputSchema.safeParse({ ...input, destinations: [] }).success, false);
    assert.equal(CampaignInputSchema.safeParse({ ...input, couponCode: "a b" }).success, false);
    assert.equal(CampaignInputSchema.safeParse({ ...input, endsAt: input.startsAt }).success, false);
    assert.equal(CampaignInputSchema.safeParse({ ...input, discountPercent: 95 }).success, false);
  });
});
