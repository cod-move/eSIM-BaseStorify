import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_REFERRAL_SETTINGS, commissionRuleOf, effectiveReferralRule, orderCommission } from "@/lib/esim/referral/rules";

const esim = (price: number) => ({ price, quantity: 1, lineAttributes: { activationDate: null } });
const number = (price: number) => ({ price, quantity: 1, lineAttributes: { number: { msisdn: "85200000000" }, label: "+852" } });
const numberTopup = (price: number) => ({ price, quantity: 1, lineAttributes: { numberTopup: { kind: "credit" }, label: "Top-up" } });
const order = (items: Array<{ price: number; quantity: number; lineAttributes: unknown }>, refundedTotal = 0) => ({
  total: items.reduce((sum, item) => sum + item.price, 0),
  refundedTotal,
  items,
});

const separate = commissionRuleOf({
  ...DEFAULT_REFERRAL_SETTINGS,
  commissionType: "percent",
  commissionValue: 10,
  numbers: { enabled: true, commissionType: "percent", commissionValue: 5 },
});

describe("number eSIMs at their own referral rate", () => {
  it("earns one rate for everything while numbers have none of their own", () => {
    const rule = commissionRuleOf(DEFAULT_REFERRAL_SETTINGS);
    assert.equal(rule.numbers, null);
    assert.deepEqual(orderCommission(order([number(20), esim(10)]), rule), { base: 30, amount: 3 });
  });

  it("earns the numbers' rate on number eSIMs and the main rate on the rest", () => {
    assert.equal(orderCommission(order([number(20)]), separate).amount, 1);
    assert.equal(orderCommission(order([esim(10)]), separate).amount, 1);
  });

  it("splits a mixed order by the lines' prices, and a refund shrinks both parts", () => {
    assert.equal(orderCommission(order([number(20), esim(10)]), separate).amount, 2); // 20 × 5% + 10 × 10%
    assert.equal(orderCommission(order([number(20), esim(10)], 15), separate).amount, 1); // half refunded
  });

  it("pays a fixed amount once for each part the order has", () => {
    const fixed = commissionRuleOf({
      ...DEFAULT_REFERRAL_SETTINGS,
      commissionType: "fixed",
      commissionValue: 100,
      numbers: { enabled: true, commissionType: "fixed", commissionValue: 300 },
    });
    assert.equal(orderCommission(order([number(20)]), fixed).amount, 3);
    assert.equal(orderCommission(order([number(20), esim(10)]), fixed).amount, 4);
    assert.equal(orderCommission(order([esim(10), esim(5)]), fixed).amount, 1);
  });

  it("gives numbers no commission at a rate of 0", () => {
    const none = commissionRuleOf({ ...DEFAULT_REFERRAL_SETTINGS, numbers: { enabled: true, commissionType: "percent", commissionValue: 0 } });
    assert.equal(orderCommission(order([number(20)]), none).amount, 0);
    assert.equal(orderCommission(order([number(20), esim(10)]), none).amount, 1);
  });
});

describe("number top-ups earn no referral reward", () => {
  it("an order of top-ups alone earns nothing, at either setting", () => {
    assert.deepEqual(orderCommission(order([numberTopup(10)]), commissionRuleOf(DEFAULT_REFERRAL_SETTINGS)), { base: 0, amount: 0 });
    assert.equal(orderCommission(order([numberTopup(10)]), separate).amount, 0);
    const fixed = commissionRuleOf({ ...DEFAULT_REFERRAL_SETTINGS, commissionType: "fixed", commissionValue: 100 });
    assert.equal(orderCommission(order([numberTopup(10), numberTopup(5)]), fixed).amount, 0);
  });

  it("leaves a top-up's share out of a mixed order", () => {
    assert.deepEqual(orderCommission(order([esim(10), numberTopup(10)]), commissionRuleOf(DEFAULT_REFERRAL_SETTINGS)), { base: 10, amount: 1 });
    assert.equal(orderCommission(order([number(20), numberTopup(10)]), separate).amount, 1);
  });

  it("recomputes a reward earned before the rule as it was earned, top-ups included", () => {
    const earlier = { commissionType: "percent" as const, commissionValue: 10 };
    assert.deepEqual(orderCommission(order([numberTopup(10)]), earlier), { base: 10, amount: 1 });
  });
});

describe("an inviter's own number rate", () => {
  const store = { ...DEFAULT_REFERRAL_SETTINGS, numbers: { enabled: true, commissionType: "percent" as const, commissionValue: 5 } };

  it("keeps the store's number rate when the inviter has only a main rate of their own", () => {
    const rule = commissionRuleOf(effectiveReferralRule(store, { commissionType: "percent", commissionValue: 20 }));
    assert.equal(orderCommission(order([number(20), esim(10)]), rule).amount, 3); // 20 × 5% + 10 × 20%
  });

  it("uses the inviter's number rate, even when the store has none", () => {
    const own = { numbersCommissionType: "percent" as const, numbersCommissionValue: 15 };
    assert.equal(orderCommission(order([number(20), esim(10)]), commissionRuleOf(effectiveReferralRule(store, own))).amount, 4); // 20 × 15% + 10 × 10%
    assert.equal(orderCommission(order([number(20)]), commissionRuleOf(effectiveReferralRule(DEFAULT_REFERRAL_SETTINGS, own))).amount, 3);
  });

  it("takes the store's number value for the same type left blank, and none for another type", () => {
    const sameType = effectiveReferralRule(store, { numbersCommissionType: "percent", numbersCommissionValue: null });
    assert.equal(sameType.numbers.commissionValue, 5);
    const otherType = effectiveReferralRule(store, { numbersCommissionType: "fixed", numbersCommissionValue: null });
    assert.equal(otherType.numbers.commissionValue, 0);
  });
});
