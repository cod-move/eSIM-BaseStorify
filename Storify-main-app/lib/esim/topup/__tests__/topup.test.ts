import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { topupEligibility, type EligibilityInput } from "../eligibility";
import { topupLineLabel } from "../label";
import { LineAttributesError, parseLineAttributes, withLineDays } from "../../cart/line-attributes";

const now = new Date("2026-10-26T12:00:00Z");
const later = new Date("2026-11-26T12:00:00Z");
const earlier = new Date("2026-10-01T12:00:00Z");

function input(overrides: Partial<EligibilityInput> = {}, rule: Partial<EligibilityInput["rule"]> = {}): EligibilityInput {
  return {
    rule: { supported: true, mode: "stack", window: "before_expiry", ...rule },
    supplierSellsTopups: true,
    status: "fulfilled",
    lifecycle: "in_use",
    expiresAt: later,
    topupDeadline: later,
    profileExpiresAt: later,
    ...overrides,
  };
}

const reason = (value: ReturnType<typeof topupEligibility>) => (value.ok ? "ok" : value.reason);

describe("topupEligibility", () => {
  it("allows a live plan that takes top-ups", () => {
    assert.equal(reason(topupEligibility(input(), now)), "ok");
    assert.equal(reason(topupEligibility(input({ lifecycle: "not_installed" }), now)), "ok");
  });

  it("refuses plans or suppliers without top-ups, and eSIMs not issued or cancelled", () => {
    assert.equal(reason(topupEligibility(input({}, { supported: false }), now)), "not_supported");
    assert.equal(reason(topupEligibility(input({}, { mode: "none" }), now)), "not_supported");
    assert.equal(reason(topupEligibility(input({ supplierSellsTopups: false }), now)), "not_supported");
    assert.equal(reason(topupEligibility(input({ status: "processing" }), now)), "not_issued");
    assert.equal(reason(topupEligibility(input({ lifecycle: "cancelled" }), now)), "cancelled");
  });

  it("before_expiry: only while the package lives", () => {
    assert.equal(reason(topupEligibility(input({ topupDeadline: earlier }), now)), "expired");
    assert.equal(reason(topupEligibility(input({ topupDeadline: null, expiresAt: earlier }), now)), "expired");
    assert.equal(reason(topupEligibility(input({ lifecycle: "expired" }), now)), "expired");
    assert.equal(reason(topupEligibility(input({ lifecycle: "depleted" }), now)), "used_up");
    // No window stated is treated as the strict one.
    assert.equal(reason(topupEligibility(input({ lifecycle: "depleted" }, { window: null }), now)), "used_up");
  });

  it("while_profile_exists: any time until the profile goes", () => {
    const anyTime = { window: "while_profile_exists" as const, mode: "addon" as const };
    assert.equal(reason(topupEligibility(input({ lifecycle: "expired", expiresAt: earlier }, anyTime), now)), "ok");
    assert.equal(reason(topupEligibility(input({ lifecycle: "depleted" }, anyTime), now)), "ok");
    assert.equal(reason(topupEligibility(input({ profileExpiresAt: earlier }, anyTime), now)), "profile_expired");
    assert.equal(reason(topupEligibility(input({ profileExpiresAt: null, lifecycle: "expired" }, anyTime), now)), "ok");
  });
});

describe("top-up line attributes", () => {
  const quoteId = "6720a1b2c3d4e5f6a7b8c9d0";

  it("accepts a quote id and ignores what the server fills in", () => {
    assert.deepEqual(parseLineAttributes({ topup: quoteId }), { topup: quoteId });
    assert.deepEqual(parseLineAttributes({ topup: quoteId, iccid: "8901", label: "x" }), { topup: quoteId });
    assert.equal(parseLineAttributes({ iccid: "8901", label: "x" }), null);
  });

  it("refuses a malformed quote id and a top-up with days", () => {
    assert.throws(() => parseLineAttributes({ topup: "nope" }), LineAttributesError);
    assert.throws(() => parseLineAttributes({ topup: 5 }), LineAttributesError);
    assert.throws(() => parseLineAttributes({ topup: quoteId, days: 3 }), LineAttributesError);
  });

  it("names the order line after the top-up and its eSIM", () => {
    const snapshot = { variantLabel: "Data top-up", variantOptions: [{ name: "Top-up", value: "Data top-up" }] };
    const label = topupLineLabel({ name: "Top-up 1GB 7Days", iccid: "89852000001234567890" });
    assert.equal(label, "Top-up 1GB 7Days · eSIM …7890");
    assert.deepEqual(withLineDays({ lineAttributes: { topup: quoteId, label } }, snapshot), {
      variantLabel: label,
      variantOptions: [{ name: "Top-up", value: label }],
    });
    // A label without a top-up is not trusted.
    assert.deepEqual(withLineDays({ lineAttributes: { label: "x" } }, snapshot), snapshot);
  });

  it("labels without an ICCID, and drops the F padding", () => {
    assert.equal(topupLineLabel({ name: "Top-up", iccid: null }), "Top-up");
    assert.equal(topupLineLabel({ name: "Top-up", iccid: "8985200000123456789F" }), "Top-up · eSIM …6789");
  });
});
