import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapEsimDetail } from "@/lib/esim/providers/roamwifi";
import type { JsonObject } from "@/lib/esim/providers/types";

/** The doc's sample (v2.11 §2.27.5), trimmed to what is read. */
const sample = (packageList: JsonObject[], dpStatus = "Enable"): JsonObject => ({
  esimInfo: { iccid: "8948010000012345678", expireDate: "2026-03-24", dpStatus },
  esimPackets: [{ orderNum: "EP20251215000285", skuId: 28, packageList }],
});
const NOW = new Date("2025-12-20T00:00:00Z");

describe("RoamWifi getESIMDetail", () => {
  it("reads a running package's data and the card's expiry", () => {
    const usage = mapEsimDetail(
      sample([{ id: 1, flows: 3, unit: "GB", days: 7, usedMb: 1024, beginDate: "2025-12-17 23:06", endDate: "2025-12-24 23:06", status: 0 }]),
      NOW,
    );
    assert.equal(usage.totalBytes, 3 * 1024 ** 3);
    assert.equal(usage.usedBytes, 1024 ** 3);
    assert.equal(usage.remainingBytes, 2 * 1024 ** 3);
    assert.equal(usage.lifecycleStatus, "in_use");
    assert.equal(usage.expiresAt, "2026-03-23T16:00:00.000Z");
  });

  it("adds a renewal running beside the first package, and says when the data is used up", () => {
    const usage = mapEsimDetail(
      sample([
        { flows: 1, unit: "GB", usedMb: 1024, beginDate: "2025-12-17 00:00", endDate: "2025-12-24 00:00" },
        { flows: 1, unit: "GB", usedMb: 1024, beginDate: "2025-12-18 00:00", endDate: "2025-12-25 00:00" },
      ]),
      NOW,
    );
    assert.equal(usage.totalBytes, 2 * 1024 ** 3);
    assert.equal(usage.lifecycleStatus, "depleted");
  });

  it("calls a card whose packages have all ended expired, even though the phone still has it", () => {
    const usage = mapEsimDetail(sample([{ flows: 3, unit: "GB", usedMb: 500, beginDate: "2025-11-01 00:00", endDate: "2025-11-08 00:00" }]), NOW);
    assert.equal(usage.lifecycleStatus, "expired");
  });

  it("tells installed from not installed before the package starts", () => {
    assert.equal(mapEsimDetail(sample([{ flows: 3, unit: "GB", usedMb: 0 }], "Disable"), NOW).lifecycleStatus, "installed");
    assert.equal(mapEsimDetail(sample([{ flows: 3, unit: "GB", usedMb: 0 }], "Delete"), NOW).lifecycleStatus, "not_installed");
  });
});
