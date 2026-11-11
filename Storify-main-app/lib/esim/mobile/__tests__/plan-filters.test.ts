import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { StorefrontVariant } from "@/lib/esim/storefront/selector";
import { planFacets, planFilterViews } from "../plan-filters";

const plan = (overrides: Partial<StorefrontVariant>): StorefrontVariant => ({
  variantId: "v",
  name: "plan",
  priceMinor: 500,
  dataType: "total",
  megabytes: 1024,
  dataValue: "1GB",
  days: 7,
  perDay: null,
  topupMode: "none",
  breakoutIp: ["JP"],
  ...overrides,
});

const t = (_key: string, fallback: string, values?: Record<string, string | number>) =>
  fallback.replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? ""));

describe("app plan filters", () => {
  it("gives each plan its values, an unnamed operator as ''", () => {
    assert.deepEqual(planFacets(plan({ coverageScope: "multi", dataType: "daily_cutoff", operators: [] })), {
      coverage: ["multi"],
      kind: ["daily"],
      days: ["7"],
      data: ["1GB"],
      topup: ["none"],
      breakout: ["JP"],
      operator: [""],
    });
  });

  it("lists only filters with a choice, with the website's words", () => {
    const views = planFilterViews(
      [
        plan({ variantId: "a", days: 1, dataValue: "1GB" }),
        plan({ variantId: "b", days: 7, dataValue: "1GB", coverageScope: "multi" }),
        plan({ variantId: "c", days: 7, dataValue: "1GB", coverageScope: "local" }),
      ],
      { t, countryCodes: ["JP"], regionNames: { JP: "Japan" } },
    );
    assert.deepEqual(
      views.map((view) => view.key),
      ["coverage", "days"],
    );
    assert.deepEqual(views[0].options, [
      { value: "local", label: "Single country/area" },
      { value: "multi", label: "Region" },
    ]);
    assert.deepEqual(views[1].options, [
      { value: "1", label: "1 day" },
      { value: "7", label: "7 days" },
    ]);
  });
});
