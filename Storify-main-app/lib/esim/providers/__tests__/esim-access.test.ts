import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EsimAccessAdapter, isDailyPackage, mapPlan, mapProfile, topupOrderOf, topupPlanIdOf, topupPlanOf } from "../esim-access";
import { topupPlanIdForDays } from "../types";
import type { JsonObject } from "../types";
import { fakeFetch } from "./helpers";

const JAPAN_3GB: JsonObject = {
  packageCode: "CKH491",
  slug: "JP_3_7",
  name: "Japan 3GB 7Days",
  price: 25000, // 1/10000 USD → $2.50
  retailPrice: 50000,
  currencyCode: "USD",
  volume: 3 * 1024 ** 3,
  duration: 7,
  durationUnit: "DAY",
  location: "JP",
  dataType: 1,
  activeType: 2,
  unusedValidTime: 180,
  supportTopUpType: 2,
  ipExport: "HK",
  locationNetworkList: [
    {
      locationCode: "JP",
      locationName: "Japan",
      operatorList: [{ operatorName: "SoftBank", networkType: "5G" }, { operatorName: "Docomo", networkType: "4G" }],
    },
  ],
};

const names = new Map([["JP", "Japan"], ["EU-42", "Europe 42"]]);

describe("eSIM Access plan mapping", () => {
  it("maps a package onto the platform structure", () => {
    const plan = mapPlan(JAPAN_3GB, names);
    assert.equal(plan.providerPlanId, "CKH491");
    assert.equal(plan.productSlug, "japan-esim");
    assert.equal(plan.coverage.scope, "local");
    assert.deepEqual(plan.coverage.countries, [{ code: "JP", name: "Japan" }]);
    assert.equal(plan.coverage.networks.length, 2);
    assert.deepEqual(plan.coverage.breakoutIp, ["HK"]);
    assert.deepEqual(plan.data, { megabytes: 3072, label: "3GB", type: "total" });
    assert.equal(plan.validityDays, 7);
    assert.deepEqual(plan.cost, { currency: "USD", amountMinor: 250, billingUnit: "plan" });
    assert.deepEqual(plan.activation, { billingStarts: "first_connection", preInstallDays: 180 });
    assert.equal(plan.topup.mode, "stack");
    assert.equal(plan.topup.window, "before_expiry");
    assert.deepEqual(plan.speed.sort(), ["4G", "5G"]);
  });

  it("treats a daily limit under 512 kbps as a cut-off", () => {
    const plan = mapPlan({ ...JAPAN_3GB, dataType: 2, fupPolicy: "128kbps after daily limit" }, names);
    assert.equal(plan.data.type, "daily_cutoff");
    const usable = mapPlan({ ...JAPAN_3GB, dataType: 2, fupPolicy: "1Mbps after daily limit" }, names);
    assert.equal(usable.data.type, "daily_throttled");
    assert.deepEqual(usable.fairUse, { highSpeedGbPerDay: 3, reducedSpeedMbps: 1 });
    const slow = mapPlan({ ...JAPAN_3GB, dataType: 2, fupPolicy: "512 Kbps" }, names);
    assert.deepEqual(slow.fairUse, { highSpeedGbPerDay: 3, reducedSpeedMbps: 0.512 });
    assert.equal(mapPlan(JAPAN_3GB, names).fairUse, null);
  });

  it("reads supportTopUpType: 2 adds data and days, 3 extends days by periodNum", () => {
    assert.equal(mapPlan({ ...JAPAN_3GB, supportTopUpType: 1 }, names).topup.supported, false);
    assert.equal(mapPlan({ ...JAPAN_3GB, supportTopUpType: 2 }, names).topup.stackTarget, "data_and_days");
    assert.equal(mapPlan({ ...JAPAN_3GB, supportTopUpType: 3 }, names).topup.stackTarget, "days");
  });

  it("sends a days top-up with periodNum", () => {
    assert.equal(topupPlanIdOf({ packageCode: "TOPUP_JC172", supportTopUpType: 2 }), "TOPUP_JC172");
    assert.deepEqual(topupOrderOf("TOPUP_JC172"), { packageCode: "TOPUP_JC172" });
    assert.deepEqual(topupOrderOf("TOPUP_D1|5"), { packageCode: "TOPUP_D1", periodNum: "5" });
  });

  it("offers a daily top-up for the days the shopper picks, priced per day", () => {
    // As the live list answers for a CN_1_Daily_1Mbps_nonhkip eSIM.
    const daily = { packageCode: "TOPUP_P9LD7ZDVR", slug: "CN_1_Daily_nonhkip", name: "China 1GB/Day (nonhkip)", price: 9600, currencyCode: "USD", volume: 1024 ** 3, dataType: 2, duration: 1, durationUnit: "DAY", supportTopUpType: 1 };
    const offer = topupPlanOf(daily);
    assert.equal(offer.topupPlanId, "TOPUP_P9LD7ZDVR");
    assert.deepEqual(offer.perDay, { minDays: 1, maxDays: 365, defaultDays: 1 });
    assert.equal(offer.cost.amountMinor, 96);
    assert.equal(offer.megabytes, 1024);
    assert.deepEqual(topupOrderOf(topupPlanIdForDays(offer.topupPlanId, 7)), { packageCode: "TOPUP_P9LD7ZDVR", periodNum: "7" });

    const fixed = topupPlanOf({ ...JAPAN_3GB, packageCode: "TOPUP_CKH491" });
    assert.equal(fixed.topupPlanId, "TOPUP_CKH491");
    assert.equal(fixed.perDay, undefined);
  });

  it("sells daily packages for the days the shopper picks, priced per day", () => {
    const plan = mapPlan({ ...JAPAN_3GB, slug: "JP_1_Daily", duration: 1, dataType: 2, fupPolicy: "512 Kbps" }, names);
    assert.deepEqual(plan.duration, { configurable: true, defaultDays: 1, minDays: 1, maxDays: 365 });
    assert.equal(plan.validityDays, 1);
    assert.equal(plan.cost.billingUnit, "day");
    assert.equal(plan.cost.amountMinor, 250);
    assert.equal(isDailyPackage({ ...JAPAN_3GB, slug: "JP_1_Daily", duration: 1, dataType: 2 }), true);
    // A one-day plan with a total allowance is a plan like any other.
    assert.equal(isDailyPackage({ ...JAPAN_3GB, slug: "JP_1_1", duration: 1, dataType: 1 }), false);
    assert.equal(mapPlan(JAPAN_3GB, names).cost.billingUnit, "plan");
  });

  it("groups multi-country packages under their region", () => {
    const plan = mapPlan(
      {
        ...JAPAN_3GB,
        slug: "EU-42_3_7",
        location: "FR,DE,IT",
        locationNetworkList: [],
      },
      names,
    );
    assert.equal(plan.coverage.scope, "regional");
    assert.equal(plan.destination, "Europe 42");
    assert.equal(plan.productSlug, "europe-42-esim");
  });
});

describe("eSIM Access profiles", () => {
  it("reads the lifecycle from esimStatus and smdpStatus", () => {
    const esim = mapProfile({
      esimTranNo: "T1",
      iccid: "8985200000000000001",
      ac: "LPA:1$rsp.esimaccess.com$XYZ",
      esimStatus: "IN_USE",
      smdpStatus: "ENABLED",
      expiredTime: "2026-11-30T00:00:00Z",
    });
    assert.equal(esim.providerEsimId, "T1");
    assert.equal(esim.lifecycle.status, "in_use");
    assert.equal(esim.lifecycle.profileStatus, "enabled");
    assert.equal(esim.installation.smdpAddress, "rsp.esimaccess.com");
    assert.equal(mapProfile({ esimTranNo: "T2", esimStatus: "USED_UP" }).lifecycle.status, "depleted");
    assert.equal(mapProfile({ esimTranNo: "T3", esimStatus: "GOT_RESOURCE", smdpStatus: "RELEASED" }).lifecycle.status, "not_installed");
  });
});

describe("eSIM Access calls", () => {
  it("orders with the idempotency key as transactionId and waits for allocation", async () => {
    let queries = 0;
    const { fetch, sent } = fakeFetch({
      "POST /api/v1/open/esim/order": () => ({ body: { success: true, obj: { orderNo: "B1" } } }),
      "POST /api/v1/open/esim/query": () => {
        queries += 1;
        return queries === 1
          ? { body: { success: false, errorCode: "200010", errorMsg: "allocating" } }
          : { body: { success: true, obj: { esimList: [] } } };
      },
    });
    const adapter = new EsimAccessAdapter({ accessCode: "code", fetch });
    const result = await adapter.purchase({ providerPlanId: "CKH491", durationDays: null, idempotencyKey: "ord-1:line-2:u1" });
    assert.equal(sent[0].headers["RT-AccessCode"], "code");
    assert.equal(JSON.parse(sent[0].body ?? "{}").transactionId, "ord1line2u1");
    assert.equal(result.status, "processing");
    assert.equal(result.providerOrderId, "B1");
    assert.deepEqual(JSON.parse(sent[0].body ?? "{}").packageInfoList, [{ packageCode: "CKH491", count: 1 }]);
  });

  it("orders a daily plan for the days the line was bought for (periodNum)", async () => {
    const { fetch, sent } = fakeFetch({
      "POST /api/v1/open/esim/order": () => ({ body: { success: true, obj: { orderNo: "B2" } } }),
      "POST /api/v1/open/esim/query": () => ({ body: { success: true, obj: { esimList: [] } } }),
    });
    const adapter = new EsimAccessAdapter({ accessCode: "code", fetch });
    await adapter.purchase({ providerPlanId: "P92TALXP8", durationDays: 7, idempotencyKey: "k7" });
    assert.deepEqual(JSON.parse(sent[0].body ?? "{}").packageInfoList, [{ packageCode: "P92TALXP8", count: 1, periodNum: 7 }]);
  });

  it("surfaces a refusal with the provider's code", async () => {
    const { fetch } = fakeFetch({
      "POST /api/v1/open/esim/order": () => ({ body: { success: false, errorCode: "310241", errorMsg: "balance insufficient" } }),
    });
    const adapter = new EsimAccessAdapter({ accessCode: "code", fetch });
    await assert.rejects(
      () => adapter.purchase({ providerPlanId: "X", durationDays: null, idempotencyKey: "k" }),
      (error: Error & { code?: string; providerCode?: string }) =>
        error.code === "rejected" && error.providerCode === "310241",
    );
  });
});
