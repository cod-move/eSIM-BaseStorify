import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MobiMatterAdapter, breakoutCountries, detailsOf, mapProduct, networksOf, preInstallDays, reducedSpeedMbps } from "../mobimatter";
import { fakeFetch } from "./helpers";
import type { JsonObject, JsonValue } from "../types";

const details = (map: Record<string, JsonValue>): JsonObject[] => Object.entries(map).map(([name, value]) => ({ name, value }));
const LPA = "LPA:1$smdp.mobimatter.test$MM-MATCH";

const PRODUCT: JsonObject = {
  productId: "MM-JP-5",
  productCategory: "esim_realtime",
  productFamilyId: 42,
  productFamilyName: "Docomo",
  providerName: "3HK",
  countries: ["JP"],
  regions: [],
  retailPrice: 9.9,
  wholesalePrice: 6.5,
  currencyCode: "USD",
  productDetails: details({
    PLAN_TITLE: "Japan 5GB 30 Days",
    PLAN_VALIDITY: "720",
    PLAN_DATA_LIMIT: "5",
    PLAN_DATA_UNIT: "GB",
    TOPUP: "true",
    NETWORKS_SHORT: "4G/5G",
    PLAN_DETAILS: JSON.stringify({ heading: "Japan", items: ["Please start using the eSIM no more than 6 months after purchase"] }),
  }),
};

function adapter(routes: Parameters<typeof fakeFetch>[0]) {
  const fake = fakeFetch(routes);
  return { mm: new MobiMatterAdapter({ merchantId: "m1", apiKey: "k1", fetch: fake.fetch }), sent: fake.sent };
}

describe("MobiMatter catalogue", () => {
  it("maps a base product", () => {
    const plan = mapProduct(PRODUCT)!;
    assert.equal(plan.providerPlanId, "MM-JP-5|esim_realtime");
    assert.equal(plan.productSlug, "japan-esim");
    assert.deepEqual(plan.coverage.countries, [{ code: "JP", name: "Japan" }]);
    assert.deepEqual(plan.data, { megabytes: 5120, label: "5GB", type: "total" });
    assert.equal(plan.validityDays, 30, "720 hours");
    assert.deepEqual(plan.cost, { currency: "USD", amountMinor: 650, billingUnit: "plan" }, "the wholesale price is the cost");
    assert.deepEqual(plan.speed, ["4G", "5G"]);
    assert.equal(plan.activation.preInstallDays, 180);
    assert.equal(plan.topup.mode, "addon");
    assert.equal(plan.sku, "42", "the family, which top-ups are bought in");
    assert.deepEqual(plan.coverage.networks, [], "no operator is named in the product list: productFamilyName is not one");
    assert.deepEqual(plan.coverage.breakoutIp, []);
  });

  it("reads the exit IP from IP_BREAKOUT, however it is written", () => {
    const withIp = (value: JsonValue) => mapProduct({ ...PRODUCT, productDetails: details({ PLAN_VALIDITY: "720", PLAN_DATA_LIMIT: "5", PLAN_DATA_UNIT: "GB", IP_BREAKOUT: value }) })!.coverage.breakoutIp;
    assert.deepEqual(withIp("HK"), ["HK"]);
    assert.deepEqual(withIp("Hong Kong"), ["HK"]);
    assert.deepEqual(withIp("Singapore IP"), ["SG"]);
    assert.deepEqual(withIp("HK/SG"), ["HK", "SG"]);
    assert.deepEqual(withIp("Hong Kong (HKG), United Kingdom"), ["HK", "GB"]);
    assert.deepEqual(withIp(["JP", "Germany"]), ["JP", "DE"]);
    assert.deepEqual(breakoutCountries(" "), []);
    assert.deepEqual(breakoutCountries("somewhere"), [], "what cannot be read is left out");
  });

  it("syncs only the 3HK product line, and refuses a list that names none", async () => {
    const list = (products: JsonObject[]) =>
      adapter({ "GET /mobimatter/api/v2/products": () => ({ body: { isSuccess: true, result: products } }) }).mm;
    const products = [
      { ...PRODUCT, productId: "MM-HK-1", productFamilyName: "3HK" },
      { ...PRODUCT, productId: "MM-HK-2", productFamilyName: "3 hk" },
      { ...PRODUCT, productId: "MM-JP-7", productFamilyName: "Docomo" },
      { ...PRODUCT, productId: "MM-JP-8", productFamilyName: "" },
      { ...PRODUCT, productId: "MM-HK-3", productFamilyName: "3HK", productCategory: "esim_addon" },
    ];
    const synced: string[] = [];
    for await (const plan of list(products).listPlans()) synced.push(plan.providerPlanId);
    assert.deepEqual(synced, ["MM-HK-1|esim_realtime", "MM-HK-2|esim_realtime"]);
    const unnamed = list([{ ...PRODUCT, productFamilyName: undefined as unknown as JsonValue }]);
    await assert.rejects(async () => {
      for await (const _plan of unnamed.listPlans()) void _plan;
    }, /no productFamilyName/);
  });

  it("knows unlimited, daily and regional products, and skips add-ons", () => {
    const unlimited = mapProduct({ ...PRODUCT, productDetails: details({ UNLIMITED: "1", PLAN_VALIDITY: "168", PLAN_DATA_LIMIT: "2", PLAN_DATA_UNIT: "GB", SPEED_LONG: "2GB per day at high speed, then speed reduced to 512 Kbps" }) })!;
    assert.equal(unlimited.data.type, "daily_throttled");
    assert.deepEqual(unlimited.fairUse, { highSpeedGbPerDay: 2, reducedSpeedMbps: 0.512 });
    const plain = mapProduct({ ...PRODUCT, productDetails: details({ UNLIMITED: "true", PLAN_VALIDITY: "168" }) })!;
    assert.equal(plain.data.type, "unlimited");
    assert.equal(plain.data.label, "Unlimited");
    const daily = mapProduct({ ...PRODUCT, productDetails: details({ PLAN_VALIDITY: "120", PLAN_DATA_LIMIT: "1", PLAN_DATA_UNIT: "GB", PLAN_DETAILS: "Daily 1GB, no throttling after" }) })!;
    assert.equal(daily.data.type, "daily_cutoff");
    const europe = mapProduct({ ...PRODUCT, countries: ["FR", "DE"], regions: ["Europe"] })!;
    assert.equal(europe.coverage.scope, "regional");
    assert.equal(europe.productSlug, "europe-esim");
    assert.equal(mapProduct({ ...PRODUCT, productCategory: "esim_addon" }), null);
  });

  it("reads the speed after the allowance and the install window", () => {
    assert.equal(reducedSpeedMbps(detailsOf(details({ SPEED_LONG: "No throttling" }))), null);
    assert.equal(reducedSpeedMbps(detailsOf(details({ SPEED_LONG: "limited to 1 Mbps" }))), 1);
    assert.equal(preInstallDays(detailsOf(details({ PLAN_DETAILS: "Usage must start within 30 days from purchase" }))), 30);
    assert.equal(preInstallDays({}), null);
  });
});

describe("MobiMatter purchase", () => {
  it("creates the order, then completes it once and reads the eSIM", async () => {
    let completed = 0;
    let state = "Created";
    const { mm, sent } = adapter({
      "POST /mobimatter/api/v2/order": () => ({ body: { isSuccess: true, result: { orderId: "ORD-1" } } }),
      "GET /mobimatter/api/v2/order/ORD-1": () => ({ body: { isSuccess: true, result: { orderId: "ORD-1", orderState: state, orderLineItem: { productId: "MM-JP-5", wholesalePrice: 6.5, lineItemDetails: details({ ICCID: "8944000000000000001", LOCAL_PROFILE_ASSISTANT: LPA, QR_CODE: "https://img/qr.png", ACCESS_POINT_NAME: "mm" }) } } } }),
      "PUT /mobimatter/api/v2/order/complete": () => {
        completed += 1;
        state = "Completed";
        return { body: { isSuccess: true, result: { orderId: "ORD-1", orderState: "Completed", orderLineItem: { wholesalePrice: 6.5, lineItemDetails: details({ ICCID: "8944000000000000001", LOCAL_PROFILE_ASSISTANT: LPA }) } } } };
      },
    });

    const started = await mm.purchase({ providerPlanId: "MM-JP-5|esim_realtime", durationDays: null, idempotencyKey: "esim-job-9" });
    assert.equal(started.status, "processing", "nothing is charged on create");
    assert.equal(started.providerOrderId, "ORD-1");
    const created = JSON.parse(sent.find((request) => request.method === "POST")!.body!);
    assert.deepEqual(created, { productId: "MM-JP-5", productCategory: "esim_realtime", label: "esim-job-9" });
    assert.equal(sent[0].headers.merchantId, "m1");
    assert.equal(sent[0].headers["api-key"], "k1");

    const done = await mm.queryPurchase("ORD-1");
    assert.equal(done.status, "fulfilled");
    assert.equal(done.esim?.providerEsimId, "ORD-1");
    assert.equal(done.esim?.iccid, "8944000000000000001");
    assert.equal(done.esim?.installation.smdpAddress, "smdp.mobimatter.test");
    assert.deepEqual(done.charged, { currency: "USD", amountMinor: 650 });

    const again = await mm.queryPurchase("ORD-1");
    assert.equal(again.status, "fulfilled");
    assert.equal(completed, 1, "a completed order is never completed again");
  });

  it("refuses a cancelled order and waits for one still being prepared", async () => {
    let state = "Cancelled";
    const { mm } = adapter({
      "GET /mobimatter/api/v2/order/ORD-2": () => ({ body: { result: { orderId: "ORD-2", orderState: state, orderLineItem: {} } } }),
    });
    await assert.rejects(() => mm.queryPurchase("ORD-2"), (error: Error & { code?: string }) => error.code === "rejected");
    state = "Processing";
    assert.equal((await mm.queryPurchase("ORD-2")).status, "processing");
  });
});

describe("MobiMatter usage and top-ups", () => {
  it("adds up the packages", async () => {
    const { mm } = adapter({
      "GET /mobimatter/api/v2/provider/info/ORD-1": () => ({ body: { result: { esim: { status: "ACTIVE" }, packages: [{ totalAllowanceMb: 5120, usedMb: 1024, expirationDate: "2099-01-01T00:00:00Z" }, { totalAllowanceMb: 1024, usedMb: 0 }] } } }),
    });
    const usage = await mm.getUsage({ providerEsimId: "ORD-1", simId: null, iccid: null });
    assert.equal(usage.totalBytes, 6144 * 1024 * 1024);
    assert.equal(usage.remainingBytes, 5120 * 1024 * 1024);
    assert.equal(usage.lifecycleStatus, "in_use");
    assert.equal(usage.expiresAt, "2099-01-01T00:00:00.000Z");
  });

  it("offers the family's add-ons and completes the add-on order once", async () => {
    let completed = 0;
    let state = "Created";
    const { mm, sent } = adapter({
      "GET /mobimatter/api/v2/order/ORD-1": () => ({ body: { result: { orderId: "ORD-1", orderState: "Completed", orderLineItem: { productId: "MM-JP-5" } } } }),
      "GET /mobimatter/api/v2/products": (request) =>
        ({ body: { result: request.url.searchParams.get("category") === "esim_addon"
          ? [{ productId: "MM-ADD-1", productCategory: "esim_addon", productFamilyId: 42, wholesalePrice: 3, currencyCode: "USD", productDetails: details({ PLAN_TITLE: "Add 1GB", PLAN_DATA_LIMIT: "1", PLAN_DATA_UNIT: "GB", PLAN_VALIDITY: "168" }) }]
          : [PRODUCT] } }),
      "POST /mobimatter/api/v2/order": () => ({ body: { result: { orderId: "TOP-1" } } }),
      "GET /mobimatter/api/v2/order/TOP-1": () => ({ body: { result: { orderId: "TOP-1", orderState: state } } }),
      "PUT /mobimatter/api/v2/order/complete": () => {
        completed += 1;
        state = "Completed";
        return { body: { result: { orderId: "TOP-1", orderState: "Completed" } } };
      },
    });
    const plans = await mm.listTopupPlans({ providerEsimId: "ORD-1", simId: null, iccid: null });
    assert.deepEqual(plans.map((plan) => [plan.topupPlanId, plan.megabytes, plan.validityDays, plan.cost.amountMinor]), [["MM-ADD-1", 1024, 7, 300]]);
    const started = await mm.topup({ esim: { providerEsimId: "ORD-1", simId: null, iccid: null }, topupPlanId: "MM-ADD-1", idempotencyKey: "provider-topup:5" });
    assert.equal(started.status, "processing", "nothing is charged on create");
    assert.deepEqual(JSON.parse(sent.filter((request) => request.method === "POST").at(-1)!.body!), { productId: "MM-ADD-1", productCategory: "esim_addon", label: "provider-topup:5", addOnIdentifier: "ORD-1" });
    assert.equal((await mm.queryTopup(started.providerTopupId)).status, "completed");
    assert.equal((await mm.queryTopup(started.providerTopupId)).status, "completed");
    assert.equal(completed, 1);
  });

  it("finds the order of an eSIM known only by ICCID, and reads errors", async () => {
    const { mm } = adapter({
      "GET /mobimatter/api/v2/order": (request) => ({ body: { result: [{ orderId: request.url.searchParams.get("ICCID") === "8944" ? "ORD-7" : "" }] } }),
      "GET /mobimatter/api/v2/order/ORD-7": () => ({ body: { result: { orderId: "ORD-7", orderState: "Completed", orderLineItem: { lineItemDetails: details({ ICCID: "8944", ACTIVATION_CODE: LPA }) } } } }),
      "GET /mobimatter/api/v2/products": () => ({ status: 401, body: { message: "bad key" } }),
    });
    const esim = await mm.getEsim({ providerEsimId: null, simId: null, iccid: "8944" });
    assert.equal(esim.providerEsimId, "ORD-7");
    await assert.rejects(() => mm.probe(), (error: Error & { code?: string }) => error.code === "credentials_missing");
  });
});

describe("MobiMatter plan networks (CAT-10)", () => {
  it("keeps one entry per country and operator, at its fastest generation", () => {
    assert.deepEqual(
      networksOf([
        { countryCode: "fr", brand: "Orange", is4G: true, is5G: false },
        { countryCode: "FR", brand: "Orange", is4G: true, is5G: true },
        { countryCode: "DE", brand: "", tadig: "DEUD1", is4G: true },
        { countryCode: "XX1", brand: "Nowhere" },
        { countryCode: "IT", brand: "TIM" },
      ]),
      [
        { countryCode: "FR", operator: "Orange", network: "5G" },
        { countryCode: "DE", operator: "DEUD1", network: "4G" },
        { countryCode: "IT", operator: "TIM", network: null },
      ],
    );
  });

  it("asks for the product's networks without its category", async () => {
    const { mm, sent } = adapter({
      "GET /mobimatter/api/v2/products/MM-EU-10/networks": () => ({ body: { isSuccess: true, result: [{ countryCode: "ES", brand: "Movistar", is5G: true }] } }),
    });
    assert.deepEqual(await mm.planNetworks("MM-EU-10|esim_realtime"), [{ countryCode: "ES", operator: "Movistar", network: "5G" }]);
    assert.equal(sent[0].headers["api-key"], "k1");
  });
});

describe("MobiMatter activation policy", () => {
  it("reads when billing starts", async () => {
    const { billingStartsOf } = await import("../mobimatter");
    assert.equal(billingStartsOf("Package activates upon first data usage."), "first_connection");
    assert.equal(billingStartsOf("The plan starts when the eSIM is installed."), "first_installation");
    assert.equal(billingStartsOf("Activates immediately after purchase."), "on_purchase");
    assert.equal(billingStartsOf(""), null);
  });
});
