import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StellarAdapter, mapPlan, topupRule } from "../stellar";
import { ProviderError, type JsonObject } from "../types";
import { fakeFetch } from "./helpers";

/** GET /plans/{id} as Stellar returned it on 2026-10-25 (public catalogue data). */
const ZAMBIA_5GB: JsonObject = {
  id: "d8ec8b36-9e6c-46c6-821d-8daf937799da",
  sku: "ESIM-ZAMBIA-5GB-30D-CKH451",
  name: "Zambia 5GB 30Days",
  slug: "zambia-esim-5gb-30-days",
  product_slug: "zambia-esim",
  emoji: "🇿🇲",
  destination: "Zambia",
  country_code: "ZM",
  data: { megabytes: 5120, label: "5GB", type: "Data in Total" },
  validity_days: 30,
  duration: { configurable: false, default_days: 30, minimum_days: 30, maximum_days: 30 },
  speed: "3G/4G/5G",
  tethering_allowed: true,
  fair_use: null,
  coverage: {
    codes: ["ZM"],
    countries: [{ country: "Zambia", country_code: "ZM" }],
    networks: [{ country: "Zambia", country_code: "ZM", operator: "Airtel", network: "4G" }],
    breakout_ip_country_code: "SG",
  },
  activation: { billing_starts: "First Network Connection", pre_install_days: 180 },
  topup: { supported: true, type: "Data Reloadable for same area within validitity" },
  price: { currency: "EUR", amount: "9.82", amount_cents: 982, billing_unit: "plan" },
  vpn: { included: true, validity_days: 37 },
  additional_info: "Stellar VPN is included.",
  available: true,
  catalogue_synced_at: "2026-10-24T21:50:32+00:00",
  updated_at: "2026-10-12T01:10:26+00:00",
  rechargeable: true,
};

/** A day-priced unlimited plan, shaped like the sampled ones. */
const RUSSIA_DAILY: JsonObject = {
  ...ZAMBIA_5GB,
  id: "11111111-2222-3333-4444-555555555555",
  name: "Russia eSIM Unlimited - 1 day",
  product_slug: "russia-esim",
  destination: "Russia",
  data: { megabytes: 0, label: "", type: "Unlimited" },
  validity_days: 1,
  duration: { configurable: true, default_days: 1, minimum_days: 1, maximum_days: 365 },
  fair_use: { high_speed_data_gb_per_day: 2, reduced_speed_mbps: 1 },
  coverage: { codes: ["RU"], countries: [{ country: "Russia", country_code: "RU" }], networks: [], breakout_ip_country_code: "FR/NL/UK" },
  price: { currency: "EUR", amount: "0.97", amount_cents: 97, billing_unit: "day" },
};

describe("Stellar plan mapping", () => {
  it("maps a fixed plan onto the platform structure", () => {
    const plan = mapPlan(ZAMBIA_5GB);
    assert.equal(plan.providerPlanId, "d8ec8b36-9e6c-46c6-821d-8daf937799da");
    assert.equal(plan.productSlug, "zambia-esim");
    assert.equal(plan.coverage.scope, "local");
    assert.deepEqual(plan.coverage.countries, [{ code: "ZM", name: "Zambia" }]);
    assert.deepEqual(plan.coverage.networks, [{ countryCode: "ZM", operator: "Airtel", network: "4G" }]);
    assert.deepEqual(plan.coverage.breakoutIp, ["SG"]);
    assert.deepEqual(plan.data, { megabytes: 5120, label: "5GB", type: "total" });
    assert.equal(plan.fairUse, null);
    assert.deepEqual(plan.speed, ["3G", "4G", "5G"]);
    assert.deepEqual(plan.activation, { billingStarts: "first_connection", preInstallDays: 180 });
    assert.deepEqual(plan.cost, { currency: "EUR", amountMinor: 982, billingUnit: "plan" });
    assert.deepEqual(plan.bundles, [{ type: "vpn", validityDays: 37 }]);
    assert.equal(plan.topup.mode, "stack");
    assert.equal(plan.topup.stackTarget, "data");
    assert.equal(plan.topup.window, "before_expiry");
    assert.equal(plan.topup.coverage, "same_area");
    assert.equal(plan.available, true);
  });

  it("maps a day-priced unlimited plan", () => {
    const plan = mapPlan(RUSSIA_DAILY);
    assert.equal(plan.data.type, "unlimited");
    assert.deepEqual(plan.duration, { configurable: true, defaultDays: 1, minDays: 1, maxDays: 365 });
    assert.deepEqual(plan.fairUse, { highSpeedGbPerDay: 2, reducedSpeedMbps: 1 });
    assert.deepEqual(plan.cost, { currency: "EUR", amountMinor: 97, billingUnit: "day" });
    // Stellar writes "UK"; ISO 3166 says GB.
    assert.deepEqual(plan.coverage.breakoutIp, ["FR", "NL", "GB"]);
  });

  it("treats multi-country plans as regional", () => {
    const plan = mapPlan({
      ...ZAMBIA_5GB,
      destination: "Africa (25+ areas)",
      coverage: { codes: ["ZM", "KE", "TZ"], countries: [], networks: [] },
    });
    assert.equal(plan.coverage.scope, "regional");
    assert.deepEqual(plan.coverage.countries.map((country) => country.code), ["ZM", "KE", "TZ"]);
  });

  it("refuses a plan priced in anything but EUR", () => {
    assert.throws(
      () => mapPlan({ ...ZAMBIA_5GB, price: { currency: "USD", amount_cents: 100 } }),
      ProviderError,
    );
  });

  it("reads the top-up wording", () => {
    assert.equal(topupRule({ supported: true, type: "Days Reloadable for extending validitity" }, true).stackTarget, "days");
    assert.equal(topupRule({ supported: true, type: "Non-reloadable" }, true).mode, "none");
    assert.equal(topupRule({}, false).supported, false);
  });
});

function page(pageNumber: number, lastPage: number, total: number, ids: string[]) {
  return {
    body: {
      data: ids.map((id) => ({ ...ZAMBIA_5GB, id })),
      meta: { current_page: pageNumber, last_page: lastPage, total, per_page: 50 },
    },
  };
}

describe("Stellar catalogue scan", () => {
  it("walks every page", async () => {
    const { fetch, sent } = fakeFetch({
      "GET /api/v1/plans": (request) =>
        request.url.searchParams.get("page") === "1" ? page(1, 2, 3, ["a", "b"]) : page(2, 2, 3, ["c"]),
    });
    const adapter = new StellarAdapter({ apiKey: "test-key", fetch });
    const ids: string[] = [];
    for await (const plan of adapter.listPlans()) ids.push(plan.providerPlanId);
    assert.deepEqual(ids, ["a", "b", "c"]);
    assert.equal(sent[0].headers.Authorization, "Bearer test-key");
  });

  it("refuses a catalogue whose total moves mid-scan", async () => {
    const { fetch } = fakeFetch({
      "GET /api/v1/plans": (request) =>
        request.url.searchParams.get("page") === "1" ? page(1, 2, 3, ["a", "b"]) : page(2, 2, 4, ["c"]),
    });
    const adapter = new StellarAdapter({ apiKey: "test-key", fetch });
    await assert.rejects(async () => {
      for await (const _plan of adapter.listPlans()) {
        // drain
      }
    }, /changed during the scan/);
  });

  it("waits out a rate limit on reads and carries on", async () => {
    let calls = 0;
    const waits: number[] = [];
    const { fetch } = fakeFetch({
      "GET /api/v1/plans": () => {
        calls += 1;
        return calls === 1
          ? { status: 429, body: { error: { code: "rate_limit_exceeded" } }, headers: { "retry-after": "7" } }
          : page(1, 1, 1, ["a"]);
      },
    });
    const adapter = new StellarAdapter({ apiKey: "k", fetch, wait: async (ms) => void waits.push(ms) });
    const ids: string[] = [];
    for await (const plan of adapter.listPlans()) ids.push(plan.providerPlanId);
    assert.deepEqual(ids, ["a"]);
    assert.deepEqual(waits, [7000]);
  });

  it("does not retry a rate-limited order", async () => {
    let orders = 0;
    const { fetch } = fakeFetch({
      "POST /api/v1/orders": () => {
        orders += 1;
        return { status: 429, body: { error: { code: "rate_limit_exceeded" } } };
      },
    });
    const adapter = new StellarAdapter({ apiKey: "k", fetch, wait: async () => undefined });
    await assert.rejects(() => adapter.purchase({ providerPlanId: "p", durationDays: null, idempotencyKey: "x" }));
    assert.equal(orders, 1);
  });

  it("refuses a repeated plan id", async () => {
    const { fetch } = fakeFetch({ "GET /api/v1/plans": () => page(1, 1, 2, ["a", "a"]) });
    const adapter = new StellarAdapter({ apiKey: "test-key", fetch });
    await assert.rejects(async () => {
      for await (const _plan of adapter.listPlans()) {
        // drain
      }
    }, /repeated plan id/);
  });
});

describe("Stellar purchase", () => {
  const card = {
    id: "esim-1",
    sim_id: "1234567890123456",
    status: "fulfilled",
    usage_available: true,
    lifecycle: { status: "installed", profile_status: "installed", installed: true },
    installation: { activation_code: "LPA:1$rsp.example.com$ABC123", apn: "e-ideas", qr_code_url: "https://example.com/qr" },
    vpn: { included: true, status: "fulfilled", ready: true, account_number: "8906", validity_days: 37 },
    customer_link: "https://example.com/e/1",
  };

  it("orders with an idempotency key and returns the eSIM", async () => {
    const { fetch, sent } = fakeFetch({
      "POST /api/v1/orders": () => ({ status: 201, body: { data: { id: "order-1", status: "processing" } } }),
      "GET /api/v1/orders/order-1": () => ({
        body: { data: { id: "order-1", status: "fulfilled", total: "9.82", currency: "EUR", esims: [card] } },
      }),
    });
    const adapter = new StellarAdapter({ apiKey: "test-key", fetch });
    const result = await adapter.purchase({
      providerPlanId: ZAMBIA_5GB.id as string,
      durationDays: null,
      idempotencyKey: "line-1-unit-1",
    });
    assert.equal(sent[0].headers["Idempotency-Key"], "line-1-unit-1");
    assert.deepEqual(JSON.parse(sent[0].body ?? "{}"), {
      plans: [{ plan_id: ZAMBIA_5GB.id, quantity: 1 }],
    });
    assert.equal(result.status, "fulfilled");
    assert.deepEqual(result.charged, { currency: "EUR", amountMinor: 982 });
    assert.equal(result.esim?.simId, "1234567890123456");
    assert.equal(result.esim?.installation.smdpAddress, "rsp.example.com");
    assert.equal(result.esim?.installation.matchingId, "ABC123");
    assert.equal(result.esim?.lifecycle.status, "installed");
    assert.equal(result.esim?.bundles[0]?.accountNumber, "8906");
  });

  it("sends the chosen number of days for a day-priced plan", async () => {
    const { fetch, sent } = fakeFetch({
      "POST /api/v1/orders": () => ({ body: { data: { id: "order-2" } } }),
      "GET /api/v1/orders/order-2": () => ({ body: { data: { id: "order-2", status: "processing", esims: [] } } }),
    });
    const adapter = new StellarAdapter({ apiKey: "test-key", fetch });
    const result = await adapter.purchase({ providerPlanId: "p", durationDays: 7, idempotencyKey: "k" });
    assert.deepEqual(JSON.parse(sent[0].body ?? "{}").plans[0], { plan_id: "p", quantity: 1, days: 7 });
    assert.equal(result.status, "processing");
  });

  it("keeps an accepted order as processing when the status read fails", async () => {
    const { fetch } = fakeFetch({
      "POST /api/v1/orders": () => ({ body: { data: { id: "order-3" } } }),
      "GET /api/v1/orders/order-3": () => ({ status: 503, body: {} }),
    });
    const adapter = new StellarAdapter({ apiKey: "test-key", fetch });
    const result = await adapter.purchase({ providerPlanId: "p", durationDays: null, idempotencyKey: "k" });
    assert.equal(result.status, "processing");
    assert.equal(result.providerOrderId, "order-3");
  });

  it("only addresses eSIMs by a 16-digit sim_id", async () => {
    const adapter = new StellarAdapter({ apiKey: "test-key", fetch: fakeFetch({}).fetch });
    await assert.rejects(
      () => adapter.getUsage({ providerEsimId: null, simId: "8901234567890123456", iccid: null }),
      /16-digit sim_id/,
    );
  });
});
