import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FLEX_DAYS, type StorefrontVariant } from "../selector";
import { chooseFilter, dataKindOf, filterPlans, pageOf, planFilterOptions } from "../plan-filter";

const v = (id: string, over: Partial<StorefrontVariant>): StorefrontVariant => ({
  variantId: id,
  name: id,
  priceMinor: 500,
  dataType: "total",
  megabytes: 1024,
  dataValue: "1GB",
  days: 7,
  perDay: null,
  topupMode: "none",
  breakoutIp: ["JP"],
  ...over,
});

const variants = [
  v("5gb-30", { megabytes: 5120, dataValue: "5GB", days: 30, priceMinor: 1500, topupMode: "stack" }),
  v("1gb-7", {}),
  v("daily-1", { dataType: "daily_cutoff", megabytes: 500, dataValue: "500MB/day", days: 1, priceMinor: 199 }),
  v("daily-5", { dataType: "daily_throttled", megabytes: 1024, dataValue: "1GB/day", days: 5, priceMinor: 450, breakoutIp: ["SG"] }),
  v("unl-flex", {
    dataType: "unlimited",
    megabytes: 0,
    dataValue: "Unlimited",
    days: null,
    perDay: { priceMinor: 299, minDays: 2, maxDays: 30, defaultDays: 3 },
    priceMinor: 299,
  }),
];

describe("plan filters", () => {
  it("tells the two daily kinds as one", () => {
    assert.equal(dataKindOf({ dataType: "daily_cutoff" }), "daily");
    assert.equal(dataKindOf({ dataType: "daily_throttled" }), "daily");
    assert.equal(dataKindOf({ dataType: "unlimited" }), "unlimited");
  });

  it("offers every value with nothing chosen, in order, from the lowest price", () => {
    const options = planFilterOptions(variants, {});
    assert.deepEqual(options.kind.map((option) => option.value), ["total", "daily", "unlimited"]);
    assert.deepEqual(options.days.map((option) => option.value), ["1", "5", "7", "30", FLEX_DAYS]);
    // A day-priced plan counts at its fewest days.
    assert.equal(options.kind.find((option) => option.value === "unlimited")?.fromPriceMinor, 598);
    assert.equal(options.kind.find((option) => option.value === "daily")?.fromPriceMinor, 199);
  });

  it("narrows the other filters, not the one being chosen", () => {
    const options = planFilterOptions(variants, { kind: "daily" });
    assert.deepEqual(options.kind.map((option) => option.value), ["total", "daily", "unlimited"]);
    assert.deepEqual(options.days.map((option) => option.value), ["1", "5"]);
    assert.deepEqual(options.breakout.map((option) => option.value), ["JP", "SG"]);
  });

  it("keeps a chosen value the others ruled out, so it can be cleared", () => {
    const options = planFilterOptions(variants, { kind: "daily", days: "30" });
    assert.ok(options.days.some((option) => option.value === "30"));
    assert.deepEqual(filterPlans(variants, { kind: "daily", days: "30" }), []);
  });

  it("clears the other filters a choice leaves without plans, and only those", () => {
    assert.deepEqual(chooseFilter(variants, { days: "30", topup: "stack" }, "kind", "daily"), { kind: "daily" });
    assert.deepEqual(chooseFilter(variants, { kind: "daily" }, "breakout", "SG"), { kind: "daily", breakout: "SG" });
    assert.deepEqual(chooseFilter(variants, { kind: "total", days: "7" }, "data", "5GB"), { kind: "total", data: "5GB" });
    assert.deepEqual(chooseFilter(variants, { kind: "total", days: "7" }, "days", undefined), { kind: "total" });
  });

  it("lists what is left, shortest first and day-priced last", () => {
    assert.deepEqual(filterPlans(variants, {}).map((variant) => variant.variantId), ["daily-1", "daily-5", "1gb-7", "5gb-30", "unl-flex"]);
    assert.deepEqual(filterPlans(variants, { kind: "total" }).map((variant) => variant.variantId), ["1gb-7", "5gb-30"]);
    assert.deepEqual(filterPlans(variants, { breakout: "SG" }).map((variant) => variant.variantId), ["daily-5"]);
  });

  it("filters by operator, a plan under each of its operators, and by an unstated value", () => {
    const plans = [
      v("cm", { operators: ["China Mobile"], breakoutIp: ["HK"] }),
      v("cu-ct", { operators: ["China Telecom", "China Unicom"], breakoutIp: ["SG"] }),
      v("none", { operators: [], breakoutIp: [] }),
    ];
    assert.deepEqual(planFilterOptions(plans, {}).operator.map((option) => option.value), ["China Mobile", "China Telecom", "China Unicom", ""], "not stated last");
    assert.deepEqual(filterPlans(plans, { operator: "China Unicom" }).map((plan) => plan.variantId), ["cu-ct"]);
    assert.deepEqual(filterPlans(plans, { operator: "" }).map((plan) => plan.variantId), ["none"]);
    assert.deepEqual(filterPlans(plans, { breakout: "" }).map((plan) => plan.variantId), ["none"], "the unstated IP is a real choice, not \"all\"");
    assert.deepEqual(planFilterOptions(plans, { breakout: "HK" }).operator.map((option) => [option.value, Number.isFinite(option.fromPriceMinor)]), [["China Mobile", true]]);
    assert.deepEqual(chooseFilter(plans, { operator: "China Mobile" }, "breakout", "SG"), { breakout: "SG" }, "an operator the new IP rules out is cleared");
  });

  it("pages the list and keeps the page in range", () => {
    const items = Array.from({ length: 25 }, (_, index) => index);
    assert.deepEqual(pageOf(items, 1, 12), { items: items.slice(0, 12), page: 1, pages: 3 });
    assert.deepEqual(pageOf(items, 3, 12).items, [24]);
    assert.equal(pageOf(items, 9, 12).page, 3);
    assert.equal(pageOf([], 1, 12).pages, 1);
  });
});
