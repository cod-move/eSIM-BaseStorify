import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayOf, formatBytes, remainingPercent } from "../display";

const base = { status: "fulfilled" as const, lifecycle: null, topupSupported: true, topupWindow: "before_expiry" as const };

describe("displayOf", () => {
  it("maps the spec's display table", () => {
    assert.equal(displayOf({ ...base, status: "processing" }).status, "issuing");
    assert.equal(displayOf({ ...base, status: "failed" }).status, "failed");
    assert.equal(displayOf(base).status, "ready_to_install");
    assert.equal(displayOf({ ...base, lifecycle: "not_installed" }).status, "ready_to_install");
    assert.equal(displayOf({ ...base, lifecycle: "installed" }).status, "installed");
    assert.equal(displayOf({ ...base, lifecycle: "in_use" }).status, "in_use");
    assert.equal(displayOf({ ...base, lifecycle: "depleted" }).status, "data_used_up");
    assert.equal(displayOf({ ...base, status: "refunded" }).status, "cancelled");
  });

  it("tells an expired eSIM from one whose profile lives on", () => {
    const voided = displayOf({ ...base, lifecycle: "expired", topupWindow: "before_expiry" });
    assert.equal(voided.status, "expired");
    assert.equal(voided.canTopup, false, "before_expiry plans cannot be renewed once expired");
    const alive = displayOf({ ...base, lifecycle: "expired", topupWindow: "while_profile_exists" });
    assert.equal(alive.status, "no_active_package");
    assert.equal(alive.canTopup, true);
  });

  it("offers install only before installation and top-up only when supported", () => {
    assert.equal(displayOf(base).canInstall, true);
    assert.equal(displayOf({ ...base, lifecycle: "in_use" }).canInstall, false);
    assert.equal(displayOf({ ...base, lifecycle: "in_use", topupSupported: false }).canTopup, false);
  });
});

describe("formatting", () => {
  it("formats bytes and the remaining share", () => {
    assert.equal(formatBytes(5 * 1024 ** 3), "5.00 GB");
    assert.equal(formatBytes(12 * 1024 ** 3), "12 GB");
    assert.equal(formatBytes(300 * 1024 ** 2), "300 MB");
    assert.equal(formatBytes(null), "—");
    assert.equal(remainingPercent(1000, 250), 25);
    assert.equal(remainingPercent(0, 10), null);
  });
});
