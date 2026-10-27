import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BnesimAdapter, mapProduct, parseOrderId } from "../bnesim";
import { fakeFetch, type SentRequest } from "./helpers";

const AREAS = {
  areas: [
    { country_iso2: "JP", country_name: "Japan" },
    { country_iso2: "FR", country_name: "France" },
    { country_iso2: "EU", country_name: "Europe" },
  ],
};
const index = { countryByName: new Map([["japan", "JP"], ["france", "FR"]]), regions: new Map([["europe", "Europe"]]) };
const form = (request: SentRequest) => Object.fromEntries(new URLSearchParams(request.body ?? ""));
const LPA = "LPA:1$smdp.bnesim.test$MATCH-123";

function adapter(routes: Parameters<typeof fakeFetch>[0], key = `key-${Math.random()}`) {
  const fake = fakeFetch({ "POST /v2.0/login": () => ({ body: { token: "tok" } }), ...routes });
  return { bnesim: new BnesimAdapter({ apiKey: key, apiSecret: "secret", fetch: fake.fetch }), sent: fake.sent };
}

describe("BNESIM catalogue", () => {
  it("maps a single-country product", () => {
    const plan = mapProduct({ id: "P1", name: "Japan 5GB", volume: 5120, duration: 30, price: "7.5", product_coverage: [{ country_iso2: "JP" }], provider: "KDDI" }, index, "USD")!;
    assert.equal(plan.productSlug, "japan-esim");
    assert.equal(plan.coverage.scope, "local");
    assert.deepEqual(plan.coverage.countries, [{ code: "JP", name: "Japan" }]);
    assert.deepEqual(plan.data, { megabytes: 5120, label: "5GB", type: "total" });
    assert.equal(plan.validityDays, 30);
    assert.deepEqual(plan.cost, { currency: "USD", amountMinor: 750, billingUnit: "plan" });
    assert.equal(plan.topup.mode, "addon");
    assert.equal(plan.coverage.networks[0].operator, "KDDI");
  });

  it("reads coverage from region names, and knows unlimited, lifetime and global", () => {
    const regional = mapProduct({ id: "P2", volume: 1024, duration: 7, region_names: "Japan, France, Europe", price: 3 }, index, "USD")!;
    assert.equal(regional.coverage.scope, "regional");
    assert.deepEqual(regional.coverage.countries.map((country) => country.code), ["JP", "FR"]);
    const unlimited = mapProduct({ id: "P3", unlimited: true, duration: 5, product_coverage: [{ country_iso2: "FR" }], price: 9 }, index, "USD")!;
    assert.equal(unlimited.data.type, "daily_throttled");
    assert.equal(unlimited.data.label, "Unlimited");
    assert.deepEqual(unlimited.fairUse, { highSpeedGbPerDay: 3, reducedSpeedMbps: 1 });
    const lifetime = mapProduct({ id: "P4", volume: 1024, duration: 365, validity_label: "No expiration", product_coverage: [{ country_iso2: "JP" }], price: 5 }, index, "USD")!;
    assert.equal(lifetime.data.type, "lifetime");
    const world = mapProduct({ id: "P5", volume: 1024, duration: 30, region_names: "Global", price: 12 }, index, "USD")!;
    assert.equal(world.coverage.scope, "global");
    assert.equal(world.productSlug, "global-esim");
    assert.equal(mapProduct({ name: "no id" }, index, "USD"), null);
  });

  it("lists plans, logging in once", async () => {
    const { bnesim, sent } = adapter({
      "POST /v2.0/enterprise/products/get-products": () => ({ body: { products: [{ id: "P1", volume: 1024, duration: 7, product_coverage: [{ country_iso2: "JP" }], price: 2 }] } }),
      "GET /v2.0/enterprise/products/get-regions-countries": () => ({ body: AREAS }),
    });
    const plans = [];
    for await (const plan of bnesim.listPlans()) plans.push(plan);
    assert.equal(plans.length, 1);
    assert.equal(sent.filter((request) => request.url.pathname.endsWith("/login")).length, 1);
    assert.ok(sent.filter((request) => !request.url.pathname.endsWith("/login")).every((request) => request.headers.Authorization === "Bearer tok"));
  });
});

describe("BNESIM purchase, step by step", () => {
  it("activates a license, adds the eSIM, then reads the card", async () => {
    let added = 0;
    const cards: Array<Record<string, unknown>> = [];
    const { bnesim, sent } = adapter({
      "POST /v2.0/enterprise/license/activation": () => ({ body: { activationTransaction: "LIC-TX" } }),
      "POST /v2.0/enterprise/activation-transaction/get-status": (request) =>
        ({ body: form(request).activationTransaction === "LIC-TX" ? { activation_status: "OK", license_cli: "CLI-1" } : { activation_status: "OK" } }),
      "POST /v2.0/enterprise/simcard/add-esim": () => {
        added += 1;
        cards.push({ iccid: "8988000000000000001", products: [{ id: "P1" }] });
        return { body: { activationTransaction: "ESIM-TX" } };
      },
      "POST /v2.0/enterprise/simcard/get-all": () => ({ body: { data: { sim_cards: cards } } }),
      "POST /v2.0/enterprise/simcard/get-detail": () => ({ body: { data: { simcard_details: { iccid: "8988000000000000001", license_cli: "CLI-1", qr_code: LPA, simcard_status: "PENDING", qr_code_image: "https://img/qr.png" } } } }),
    });

    const first = await bnesim.purchase({ providerPlanId: "P1", durationDays: null, idempotencyKey: "esim-job-1" });
    assert.equal(first.status, "processing");
    assert.equal(first.providerOrderId, "LIC-TX#P1");
    assert.equal(form(sent.find((request) => request.url.pathname.endsWith("/license/activation"))!).name, "esim-job-1");

    const second = await bnesim.queryPurchase(first.providerOrderId);
    assert.equal(second.status, "processing", "the eSIM step is stored before it is checked");
    assert.equal(second.providerOrderId, "ESIM-TX|CLI-1#P1");
    assert.equal(added, 1);

    const third = await bnesim.queryPurchase(second.providerOrderId);
    assert.equal(third.status, "fulfilled");
    assert.equal(third.esim?.iccid, "8988000000000000001");
    assert.equal(third.esim?.installation.activationCode, LPA);
    assert.equal(third.esim?.installation.smdpAddress, "smdp.bnesim.test");
    assert.equal(third.esim?.installation.qrCodeUrl, "https://img/qr.png");
    assert.equal(third.esim?.simId, "CLI-1");
    assert.equal(added, 1, "never a second eSIM");
  });

  it("a retried license step finds the card already added and adds no other", async () => {
    let added = 0;
    const { bnesim } = adapter({
      "POST /v2.0/enterprise/activation-transaction/get-status": () => ({ body: { activation_status: "OK", license_cli: "CLI-1" } }),
      "POST /v2.0/enterprise/simcard/add-esim": () => {
        added += 1;
        return { body: { activationTransaction: "ESIM-TX" } };
      },
      "POST /v2.0/enterprise/simcard/get-all": () => ({ body: { data: { sim_cards: [{ iccid: "8988000000000000002", products: [{ id: "P1" }] }] } } }),
      "POST /v2.0/enterprise/simcard/get-detail": () => ({ body: { data: { simcard_details: { iccid: "8988000000000000002", qr_code: LPA } } } }),
    });
    const result = await bnesim.queryPurchase("LIC-TX#P1");
    assert.equal(result.status, "fulfilled");
    assert.equal(added, 0);
  });

  it("waits while pending and refuses a failed activation", async () => {
    let state = "PENDING";
    const { bnesim } = adapter({
      "POST /v2.0/enterprise/activation-transaction/get-status": () => ({ body: { activation_status: state } }),
    });
    assert.equal((await bnesim.queryPurchase("LIC-TX#P1")).status, "processing");
    state = "FAILED";
    await assert.rejects(() => bnesim.queryPurchase("LIC-TX#P1"), (error: Error & { code?: string }) => error.code === "rejected");
    assert.throws(() => parseOrderId("no-plan"), /Not a BNESIM purchase reference/);
  });
});

describe("BNESIM usage and top-ups", () => {
  const detail = {
    data: {
      simcard_details: {
        iccid: "8988000000000000003",
        license_cli: "CLI-3",
        simcard_status: "ACTIVE",
        products: [{ id: "P1", product_coverage: [{ country_iso2: "JP" }] }],
        data_credit_details: { JP: { "30": { total: 5120, remaining: 1024, expiration_date: "2099-01-01 00:00:00" } } },
      },
    },
  };

  it("reads nested data credits", async () => {
    const { bnesim } = adapter({ "POST /v2.0/enterprise/simcard/get-detail": () => ({ body: detail }) });
    const usage = await bnesim.getUsage({ providerEsimId: null, simId: null, iccid: "8988000000000000003" });
    assert.equal(usage.totalBytes, 5120 * 1024 * 1024);
    assert.equal(usage.remainingBytes, 1024 * 1024 * 1024);
    assert.equal(usage.lifecycleStatus, "in_use");
    assert.equal(usage.expiresAt, new Date("2099-01-01T00:00:00").toISOString());
  });

  it("offers products for the card's countries and recharges with its license", async () => {
    const { bnesim, sent } = adapter({
      "POST /v2.0/enterprise/simcard/get-detail": () => ({ body: detail }),
      "POST /v2.0/enterprise/products/get-products": () => ({
        body: { products: [
          { id: "JP-1G", name: "Japan 1GB", volume: 1024, duration: 7, price: 2, product_coverage: [{ country_iso2: "JP" }] },
          { id: "FR-1G", volume: 1024, duration: 7, price: 2, product_coverage: [{ country_iso2: "FR" }] },
        ] },
      }),
      "GET /v2.0/enterprise/products/get-regions-countries": () => ({ body: AREAS }),
      "POST /v2.0/enterprise/simcard/recharge": () => ({ body: { success: true, activationTransaction: "RC-1" } }),
    });
    const plans = await bnesim.listTopupPlans({ providerEsimId: null, simId: null, iccid: "8988000000000000003" });
    assert.deepEqual(plans.map((plan) => plan.topupPlanId), ["JP-1G|CLI-3"]);
    assert.deepEqual(plans[0].cost, { currency: "USD", amountMinor: 200 });
    const result = await bnesim.topup({ esim: { providerEsimId: null, simId: null, iccid: "8988000000000000003" }, topupPlanId: "JP-1G|CLI-3", idempotencyKey: "provider-topup:1" });
    assert.equal(result.providerTopupId, "RC-1");
    assert.deepEqual(form(sent.find((request) => request.url.pathname.endsWith("/recharge"))!), { iccid: "8988000000000000003", product_id: "JP-1G", license_cli: "CLI-3" });
    assert.equal(bnesim.nonIdempotent.topup, true, "the top-up job must not retry an uncertain recharge");
  });
});

describe("BNESIM errors", () => {
  it("logs in again once on 401, and tells refusals from uncertainty", async () => {
    let logins = 0;
    let first = true;
    const fake = fakeFetch({
      "POST /v2.0/login": () => {
        logins += 1;
        return { body: { token: `tok-${logins}` } };
      },
      "POST /v2.0/enterprise/products/get-products": () => {
        if (first) {
          first = false;
          return { status: 401, body: { message: "expired" } };
        }
        return { body: { products: [] } };
      },
      "GET /v2.0/enterprise/products/get-regions-countries": () => ({ status: 503, body: {} }),
      "POST /v2.0/enterprise/simcard/recharge": () => ({ body: { success: false, message: "Insufficient balance" } }),
    });
    const bnesim = new BnesimAdapter({ apiKey: `key-401-${Math.random()}`, apiSecret: "s", fetch: fake.fetch });
    assert.deepEqual(await bnesim.getPlan("none").catch((error) => (error as { code: string }).code), "uncertain", "a 5xx is uncertain");
    assert.equal(logins, 2, "logged in again after the 401");
    await assert.rejects(
      () => bnesim.topup({ esim: { providerEsimId: null, simId: null, iccid: "1" }, topupPlanId: "X|CLI", idempotencyKey: "k" }),
      (error: Error & { code?: string }) => error.code === "rejected" && /Insufficient balance/.test(error.message),
    );
  });
});
