import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapOrderUsage } from "@/lib/esim/providers/roamwifi";
import type { JsonObject } from "@/lib/esim/providers/types";

/** A live getOrderInfo answer's shape (identifiers replaced). */
const order = (card: JsonObject = {}): JsonObject => ({
  orderNum: "EP20261020000001",
  display: "Asia 8",
  startDate: "2026-10-20(GMT+8)",
  endDate: "null(GMT+8)",
  status: 0,
  cardApiDtoList: [
    {
      data: "10GB",
      validity: 30,
      sm_dp_address: "smdp.example.com",
      iccid: "8985000000000000001",
      activateBefore: "2027-02-17(GMT+8)",
      usedMB: "8246.89",
      startDate: "2026-10-20 17:38:29.0(GMT+8)",
      endDate: "2026-11-19 17:38:29.0(GMT+8)",
      dpStatus: "ACTIVE",
      ...card,
    },
  ],
});
const NOW = new Date("2026-11-07T00:00:00Z");

describe("RoamWifi usage from getOrderInfo", () => {
  it("reads the allowance from `data` and the use from `usedMB`", () => {
    const usage = mapOrderUsage(order(), "8985000000000000001", NOW);
    assert.equal(usage.totalBytes, 10 * 1024 ** 3);
    assert.equal(usage.usedBytes, Math.round(8246.89 * 1024 ** 2));
    assert.equal(usage.remainingBytes, 10 * 1024 ** 3 - Math.round(8246.89 * 1024 ** 2));
    assert.equal(usage.lifecycleStatus, "in_use");
  });

  it("reads RoamWifi's times as GMT+8", () => {
    assert.equal(mapOrderUsage(order(), null, NOW).expiresAt, "2026-11-19T09:38:29.000Z");
  });

  it("is expired past its end, and used up with nothing left", () => {
    assert.equal(mapOrderUsage(order(), null, new Date("2026-11-20T00:00:00Z")).lifecycleStatus, "expired");
    assert.equal(mapOrderUsage(order({ usedMB: "10240" }), null, NOW).lifecycleStatus, "depleted");
  });

  it("before it starts, goes by dpStatus", () => {
    const usage = mapOrderUsage(order({ startDate: null, endDate: null, usedMB: "0", dpStatus: "RELEASED" }), null, NOW);
    assert.equal(usage.lifecycleStatus, "not_installed");
    assert.equal(usage.remainingBytes, 10 * 1024 ** 3);
  });
});

describe("RoamWifi dpStatus", () => {
  it("is where the profile is on the phone, never a cancelled plan", () => {
    for (const dpStatus of ["ACTIVE", "Enable", "Disable", "Delete"]) {
      assert.equal(mapOrderUsage(order({ dpStatus }), null, NOW).lifecycleStatus, "in_use", dpStatus);
    }
    const unstarted = { startDate: null, endDate: null, usedMB: "0" };
    assert.equal(mapOrderUsage(order({ ...unstarted, dpStatus: "Enable" }), null, NOW).lifecycleStatus, "installed");
    assert.equal(mapOrderUsage(order({ ...unstarted, dpStatus: "Disable" }), null, NOW).lifecycleStatus, "installed");
    assert.equal(mapOrderUsage(order({ ...unstarted, dpStatus: "Delete" }), null, NOW).lifecycleStatus, "not_installed");
  });
});
