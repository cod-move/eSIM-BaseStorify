import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_REFERRAL_SETTINGS, dataRewardsAt, effectiveReferralRule, type ReferralSettings } from "@/lib/esim/referral/rules";

const dataSettings: ReferralSettings = {
  ...DEFAULT_REFERRAL_SETTINGS,
  enabled: true,
  rewardType: "data",
  data: { referrerMb: 1024, referrerOn: "first_order", inviteeMb: 300, inviteeOn: "signup" },
};
const at = new Date("2026-11-20T10:00:00Z");

describe("referral data rewards", () => {
  it("gives each side at its own moment", () => {
    assert.deepEqual(dataRewardsAt("signup", { referralId: "r1", validUntil: null, at }, dataSettings), { referrerMb: 0, inviteeMb: 300 });
    assert.deepEqual(dataRewardsAt("first_order", { referralId: "r1", validUntil: null, at }, dataSettings), { referrerMb: 1024, inviteeMb: 0 });
  });

  it("gives nothing with money rewards, when off, or for a first order after the referral ran out", () => {
    const none = { referrerMb: 0, inviteeMb: 0 };
    assert.deepEqual(dataRewardsAt("first_order", { referralId: "r1", validUntil: null, at }, { ...dataSettings, rewardType: "credit" }), none);
    assert.deepEqual(dataRewardsAt("signup", { referralId: "r1", validUntil: null, at }, { ...dataSettings, enabled: false }), none);
    assert.deepEqual(dataRewardsAt("first_order", { referralId: "r1", validUntil: new Date("2026-11-01T00:00:00Z"), at }, dataSettings), none);
  });

  it("keeps the referrer's share out of the deducted share (扣量), never the friend's", () => {
    const all = dataRewardsAt("first_order", { referralId: "r1", validUntil: null, at }, { ...dataSettings, deductPercent: 100, data: { ...dataSettings.data, inviteeOn: "first_order" } });
    assert.deepEqual(all, { referrerMb: 0, inviteeMb: 300 });
  });

  it("lets one referrer's own rules change the data rewards, the rest following the store", () => {
    const own = effectiveReferralRule(dataSettings, { rewardType: null, referrerMb: 2048, referrerOn: null, inviteeMb: null, inviteeOn: "first_order" });
    assert.equal(own.rewardType, "data");
    assert.deepEqual(own.data, { referrerMb: 2048, referrerOn: "first_order", inviteeMb: 300, inviteeOn: "first_order" });
    assert.equal(effectiveReferralRule({ ...dataSettings, rewardType: "credit" }, { rewardType: "data" }).rewardType, "data");
  });
});
