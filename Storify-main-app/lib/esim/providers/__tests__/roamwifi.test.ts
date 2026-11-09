import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { countryCodeFromName } from "../countries";
import { RoamWifiAdapter, externalId, mapEsimDetail, mapSkuPlans, sign } from "../roamwifi";
import { fakeFetch } from "./helpers";

describe("RoamWifi external ids", () => {
  it("keeps short keys and hashes long ones under 32 characters, stably", () => {
    assert.equal(externalId("esim-job-1"), "esim-job-1");
    const purchase = "esim-6727a1b2c3d4e5f6a7b8c9d0-a7b8c9d0-h2";
    const topup = "provider-topup:6727a1b2c3d4e5f6a7b8c9d0";
    for (const key of [purchase, topup]) {
      const id = externalId(key);
      assert.ok(id.length < 32, `${id} is ${id.length} characters`);
      assert.match(id, /^[a-z0-9]+$/);
      assert.equal(externalId(key), id);
    }
    assert.notEqual(externalId(purchase), externalId(topup));
  });
});

describe("RoamWifi signing", () => {
  it("signs sorted, non-empty pairs rawurlencoded with the key", () => {
    const expected = createHash("md5")
      .update("apiCode%3DA1count%3D1token%3Dt%2Fkey")
      .digest("hex")
      .toUpperCase();
    assert.equal(sign({ token: "t/", count: "1", apiCode: "A1", empty: "" }, "key"), expected);
  });

  it("encodes the characters encodeURIComponent leaves alone, as PHP does", () => {
    const withBang = sign({ a: "x!" }, "k");
    const manual = createHash("md5").update("a%3Dx%21k").digest("hex").toUpperCase();
    assert.equal(withBang, manual);
  });
});

describe("country names", () => {
  it("resolves ICU names and provider spellings", () => {
    assert.equal(countryCodeFromName("Japan"), "JP");
    assert.equal(countryCodeFromName("China mainland"), "CN");
    assert.equal(countryCodeFromName("Hong Kong SAR"), "HK");
    assert.equal(countryCodeFromName("United States"), "US");
    assert.equal(countryCodeFromName("Côte d’Ivoire"), "CI");
    assert.equal(countryCodeFromName("Atlantis"), null);
  });
});

describe("RoamWifi catalogue", () => {
  it("maps a SKU's packages", () => {
    const plans = mapSkuPlans(
      { skuid: "156", display: "Japan", countryCode: "81" },
      {
        displayEn: "Japan",
        countryImageUrlDtoList: [{ nameEn: "Japan", countryCode: "81" }],
        esimPackageDtoList: [
          { apiCode: "JP-3G-7D", flows: 3, unit: "GB", days: 7, price: "4.5", flowType: 0, networkDtoList: [{ operator: "KDDI", type: "5g" }] },
          { apiCode: "JP-DAY", flows: 1, unit: "GB", days: 5, price: "6", flowType: 1, supportDaypass: 1 },
        ],
      },
      "USD",
    );
    assert.equal(plans.length, 2);
    assert.equal(plans[0].productSlug, "japan-esim");
    assert.deepEqual(plans[0].coverage.countries, [{ code: "JP", name: "Japan" }]);
    assert.deepEqual(plans[0].data, { megabytes: 3072, label: "3GB", type: "total" });
    assert.deepEqual(plans[0].cost, { currency: "USD", amountMinor: 450, billingUnit: "plan" });
    assert.equal(plans[0].topup.mode, "addon");
    assert.deepEqual(plans[0].speed, ["5G"]);
    assert.equal(plans[1].data.type, "daily_throttled");
    assert.equal(plans[1].topup.supported, false);
  });

  it("logs in once, signs every call and re-logs on code -1", async () => {
    let logins = 0;
    let skuCalls = 0;
    const { fetch, sent } = fakeFetch({
      "POST /api_order/login": () => {
        logins += 1;
        return { body: { Code: 1, data: { token: `tok${logins}` } } };
      },
      "POST /api_esim/getSkus": () => {
        skuCalls += 1;
        return skuCalls === 1 ? { body: { code: -1, message: "token expired" } } : { body: { code: 0, data: [] } };
      },
    });
    const adapter = new RoamWifiAdapter({ phoneNumber: `+852${Date.now()}`, password: "pw", fetch });
    await adapter.probe();
    assert.equal(logins, 2);
    const last = new URLSearchParams(sent.at(-1)?.body ?? "");
    assert.equal(last.get("token"), "tok2");
    assert.match(last.get("sign") ?? "", /^[0-9A-F]{32}$/);
  });
});

describe("RoamWifi regional networks", () => {
  it("files each network under its own country", () => {
    const [plan] = mapSkuPlans(
      { skuid: "1001", countryCode: 1001 },
      {
        displayEn: "China HK Macao",
        countryImageUrlDtoList: [{ nameEn: "China" }, { nameEn: "Hong Kong" }],
        esimPackageDtoList: [{ apiCode: "CHM-1G", flows: 1, unit: "GB", days: 7, price: "3", flowType: 0, networkDtoList: [
          { type: "5G", operator: "China Mobile", namecn: "中国", nameen: "China", countryCode: 156 },
          { type: "4G", operator: "CSL", nameen: "Hong Kong", countryCode: 344 },
        ] }],
      },
      "USD",
    );
    assert.deepEqual(plan.coverage.networks.map((network) => [network.countryCode, network.operator]), [["CN", "China Mobile"], ["HK", "CSL"]]);
  });
});

describe("RoamWifi renewals and card detail (doc v2.13)", () => {
  const login = { "POST /api_order/login": () => ({ body: { Code: 1, data: { token: "tok" } } }) };
  const pkg = (apiCode: string) => ({ apiCode, flows: 1, unit: "GB", days: 3, price: 2.66, flowType: 0 });

  it("lists renewals from the ICCID's packages at once", async () => {
    const { fetch } = fakeFetch({
      ...login,
      "POST /api_esim/getIccidSupportPackageInfo": () => ({ body: { code: "0", data: { skuid: 45, displayEn: "Austria", esimPackageDtoList: [pkg("40-0-3-1-G")] } } }),
    });
    const adapter = new RoamWifiAdapter({ phoneNumber: `+852${Date.now()}1`, password: "pw", fetch });
    const plans = await adapter.listTopupPlans({ providerEsimId: "EP1", simId: null, iccid: "8948010000000000001" });
    assert.deepEqual(plans.map((plan) => [plan.topupPlanId, plan.megabytes, plan.validityDays]), [["40-0-3-1-G", 1024, 3]]);
  });

  it("falls back to the eSIM's own SKU when the ICCID names none", async () => {
    const { fetch, sent } = fakeFetch({
      ...login,
      "POST /api_esim/getIccidSupportPackageInfo": () => ({ body: { code: "0", data: { esimPackageDtoList: [] } } }),
      "POST /api_esim/getICCIDSupportSkuInfo": () => ({ body: { code: "0", data: [] } }),
      "POST /api_esim/getESIMDetail": () => ({ body: { code: 1, status: "Success", data: { esimInfo: { iccid: "x" }, esimPackets: [{ skuId: 28, packageList: [] }] } } }),
      "POST /api_esim/getICCIDSkuSupportPackageInfo": () => ({ body: { code: "0", data: { displayEn: "Kazakhstan", esimPackageDtoList: [pkg("398-0-7-3-G")] } } }),
    });
    const adapter = new RoamWifiAdapter({ phoneNumber: `+852${Date.now()}2`, password: "pw", fetch });
    const plans = await adapter.listTopupPlans({ providerEsimId: "EP1", simId: null, iccid: "8948010000000000001" });
    assert.deepEqual(plans.map((plan) => plan.topupPlanId), ["398-0-7-3-G"]);
    const asked = sent.find((request) => request.url.pathname.endsWith("getICCIDSkuSupportPackageInfo"));
    assert.equal(new URLSearchParams(asked?.body ?? "").get("skuId"), "28");
  });

  it("reads usage from getESIMDetail, whose success is code 1", async () => {
    const { fetch } = fakeFetch({
      ...login,
      "POST /api_esim/getESIMDetail": () => ({
        body: {
          code: 1,
          status: "Success",
          data: {
            esimInfo: { iccid: "8948010000000000001", dpStatus: "Enable", expireDate: "2030-03-24" },
            esimPackets: [{ skuId: 28, packageList: [{ flows: 3, unit: "GB", usedMb: 1024, beginDate: "2025-12-17 23:06", endDate: "2030-12-24 23:06" }] }],
          },
        },
      }),
    });
    const adapter = new RoamWifiAdapter({ phoneNumber: `+852${Date.now()}3`, password: "pw", fetch });
    const usage = await adapter.getUsage({ providerEsimId: "EP1", simId: null, iccid: "8948010000000000001" });
    assert.equal(usage.lifecycleStatus, "in_use");
    assert.equal(usage.usedBytes, 1024 * 1024 * 1024);
  });

  it("counts packages by their status: cancelled, unpaid and unsubscribing are left out, completed has ended", () => {
    const now = new Date("2026-11-09T00:00:00Z");
    const pkg = (status: number, extra: Record<string, unknown> = {}) => ({ status, flows: 1, unit: "GB", usedMb: 0, beginDate: "2026-11-01 00:00", endDate: "2026-12-01 00:00", ...extra });
    const detail = (packageList: unknown[], dpStatus = "Enable") => mapEsimDetail({ esimInfo: { dpStatus }, esimPackets: [{ skuId: 1, packageList }] } as never, now);
    assert.equal(detail([pkg(0)]).lifecycleStatus, "in_use");
    assert.equal(detail([pkg(2)]).lifecycleStatus, "expired", "completed before its end date");
    assert.equal(detail([pkg(1), pkg(-1), pkg(3)]).lifecycleStatus, "cancelled");
    assert.equal(detail([pkg(1, { flows: 5 }), pkg(0)]).totalBytes, 1024 ** 3, "a cancelled package adds no data");
    assert.equal(detail([pkg(0, { beginDate: null, endDate: null })], "Delete").lifecycleStatus, "not_installed");
    assert.equal(detail([pkg(0, { beginDate: null, endDate: null })], "ACTIVE").lifecycleStatus, "installed");
  });
});
