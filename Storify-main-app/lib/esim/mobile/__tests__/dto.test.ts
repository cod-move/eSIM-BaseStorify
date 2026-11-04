import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EsimDestinationDetail, EsimDetail, EsimSummary } from "@/contracts/mobile/shop/v1/esim";
import { displayOf } from "@/lib/esim/account/display";
import type { EsimView } from "@/lib/esim/account/esims";
import { toEsimDestinationDetail, toEsimDetail, toEsimSummary } from "../dto";
import type { DestinationDetail } from "@/lib/esim/storefront/catalog";

const GB = 1024 ** 3;

function view(overrides: Partial<EsimView> = {}): EsimView {
  return {
    id: "e1",
    orderNumber: "ORD000123",
    planName: "Japan 5 GB · 7 days",
    destination: "Japan",
    emoji: "🇯🇵",
    dataLabel: "5 GB",
    dataType: "total",
    validityDays: 7,
    providerCode: "stellar",
    iccid: "8985200000000001234",
    display: displayOf({ status: "fulfilled", lifecycle: "in_use", topupSupported: true, topupWindow: "before_expiry" }),
    remark: null,
    usage: { totalBytes: 5 * GB, usedBytes: 1 * GB, remainingBytes: 4 * GB, expiresAt: null, syncedAt: new Date("2026-10-27T10:00:00Z"), stale: false },
    lastUsageUpdateAt: null,
    fulfilledAt: new Date("2026-10-20T00:00:00Z"),
    expiresAt: new Date("2026-10-27T00:00:00Z"),
    activationDeadline: null,
    topupDeadline: null,
    installation: { activationCode: "LPA:1$rsp.example$ABC", smdpAddress: "rsp.example", matchingId: "ABC", qrCodeUrl: null, apn: null },
    customerLink: null,
    bundles: [],
    ...overrides,
  };
}

describe("the mobile eSIM shapes", () => {
  it("summarises with printed amounts and the share left", () => {
    const summary = EsimSummary.parse(toEsimSummary(view()));
    assert.equal(summary.status, "in_use");
    assert.equal(summary.tone, "success");
    assert.equal(summary.iccidEnd, "1234");
    assert.equal(summary.usage?.remaining.formatted, "4.00 GB");
    assert.equal(summary.usage?.remainingPercent, 80);
    assert.equal(summary.usage?.unlimited, false);
    assert.equal(summary.remark, undefined, "no remark is left out, not null");
  });

  it("an unlimited plan has no share left to show", () => {
    const summary = toEsimSummary(view({ dataType: "unlimited", usage: { totalBytes: 0, usedBytes: 3 * GB, remainingBytes: 0, expiresAt: null, syncedAt: null, stale: true } }));
    assert.equal(summary.usage?.unlimited, true);
    assert.equal(summary.usage?.remainingPercent, undefined);
    assert.equal(summary.usage?.stale, true);
  });

  it("details carry the QR image and the one-tap install links", async () => {
    const detail = EsimDetail.parse(await toEsimDetail(view()));
    assert.match(detail.install?.qrImage ?? "", /^data:image\/png;base64,/);
    assert.equal(detail.install?.iosLink, "https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=LPA%3A1%24rsp.example%24ABC");
    assert.equal(detail.install?.matchingId, "ABC");
    assert.equal(detail.canTopup, true);
  });

  it("no install details for an eSIM being issued, failed or cancelled", async () => {
    for (const status of ["processing", "failed", "cancelled"] as const) {
      const detail = await toEsimDetail(view({ display: displayOf({ status, lifecycle: null, topupSupported: false, topupWindow: null }) }));
      assert.equal(detail.install, undefined, status);
    }
    const noCode = await toEsimDetail(view({ installation: { activationCode: null, smdpAddress: null, matchingId: null, qrCodeUrl: null, apn: null } }));
    assert.equal(noCode.install, undefined);
  });
});

describe("the mobile destination shapes", () => {
  const destination: DestinationDetail = {
    slug: "japan",
    name: "Japan",
    emoji: "🇯🇵",
    scope: "local",
    continent: "asia",
    countries: [{ code: "JP", name: "Japan" }],
    productId: "p1",
    productHandle: "japan-esim",
    fromPriceMinor: 450,
    variantCount: 2,
    variants: [
      { variantId: "v1", name: "5GB 7 days", priceMinor: 450, dataType: "total", megabytes: 5120, dataValue: "5GB", days: 7, perDay: null, topupMode: "stack", breakoutIp: [] },
      { variantId: "v2", name: "Unlimited", priceMinor: 600, dataType: "daily_throttled", megabytes: 0, dataValue: "Unlimited", days: null, perDay: { priceMinor: 200, minDays: 3, maxDays: 30, defaultDays: 7 }, topupMode: "none", breakoutIp: [] },
    ],
    networks: [{ countryCode: "JP", operator: "Docomo", network: null }],
    coverageSets: [],
    image: null,
    updatedAt: "2026-10-27T00:00:00Z",
  };

  it("prices plans in the store currency and carries the day range", () => {
    const detail = EsimDestinationDetail.parse(toEsimDestinationDetail(destination, "USD"));
    assert.equal(detail.pathScope, "local");
    assert.equal(detail.fromPrice?.amount, 4.5);
    assert.equal(detail.plans[0].days, 7);
    assert.equal(detail.plans[0].perDay, undefined);
    assert.equal(detail.plans[1].days, undefined);
    assert.deepEqual({ min: detail.plans[1].perDay?.minDays, max: detail.plans[1].perDay?.maxDays, day: detail.plans[1].perDay?.pricePerDay.amount }, { min: 3, max: 30, day: 2 });
    assert.equal(detail.networks[0].network, undefined, "no network is left out, not null");
    assert.equal(detail.productSlug, "japan-esim");
  });

  it("a region is reached under multi", () => {
    assert.equal(toEsimDestinationDetail({ ...destination, scope: "regional", continent: null }, "USD").pathScope, "multi");
  });
});
