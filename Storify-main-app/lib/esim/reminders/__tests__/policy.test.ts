import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dueReminders, syncIntervalMs, type ReminderInput } from "../policy";

const now = new Date("2026-10-26T12:00:00Z");
const hours = (n: number) => new Date(now.getTime() + n * 3_600_000);
const settings = { enabled: true, lowDataPercent: 20, expiringHours: 24, installDays: 3 };
const GB = 1024 ** 3;

function input(overrides: Partial<ReminderInput> = {}): ReminderInput {
  return {
    lifecycle: "in_use",
    installed: true,
    counted: true,
    totalBytes: 5 * GB,
    remainingBytes: 3 * GB,
    expiresAt: hours(24 * 10),
    activationDeadline: null,
    sent: { activatedAt: null, lowDataForTotal: null, expiringFor: null, installDeadlineFor: null },
    ...overrides,
  };
}

describe("dueReminders", () => {
  it("nothing for a healthy eSIM, or when reminders are off", () => {
    assert.deepEqual(dueReminders(input(), settings, now), []);
    assert.deepEqual(dueReminders(input({ remainingBytes: GB / 10 }), { ...settings, enabled: false }, now), []);
  });

  it("activated only on a transition the sync saw, once", () => {
    assert.deepEqual(dueReminders(input({ previousLifecycle: "installed" }), settings, now), ["activated"]);
    assert.deepEqual(dueReminders(input({ previousLifecycle: null }), settings, now), ["activated"]);
    assert.deepEqual(dueReminders(input(), settings, now), [], "not looked up: no transition known");
    assert.deepEqual(dueReminders(input({ previousLifecycle: "in_use" }), settings, now), []);
    assert.deepEqual(dueReminders(input({ previousLifecycle: "installed", sent: { ...input().sent, activatedAt: now } }), settings, now), []);
  });

  it("low data at the threshold, once per allowance", () => {
    assert.deepEqual(dueReminders(input({ remainingBytes: GB }), settings, now), ["low_data"], "exactly 20%");
    assert.deepEqual(dueReminders(input({ remainingBytes: GB + 1 }), settings, now), []);
    assert.deepEqual(dueReminders(input({ remainingBytes: GB / 2, sent: { ...input().sent, lowDataForTotal: 5 * GB } }), settings, now), []);
    // A top-up raised the total: armed again.
    assert.deepEqual(dueReminders(input({ totalBytes: 6 * GB, remainingBytes: GB / 2, sent: { ...input().sent, lowDataForTotal: 5 * GB } }), settings, now), ["low_data"]);
    assert.deepEqual(dueReminders(input({ remainingBytes: 0 }), settings, now), [], "used up is not low");
    assert.deepEqual(dueReminders(input({ counted: false, remainingBytes: 1 }), settings, now), [], "unlimited plans are not counted");
    assert.deepEqual(dueReminders(input({ lifecycle: "expired", remainingBytes: 1 }), settings, now), []);
  });

  it("plan ending within the window, once per end date", () => {
    assert.deepEqual(dueReminders(input({ expiresAt: hours(23) }), settings, now), ["expiring"]);
    assert.deepEqual(dueReminders(input({ expiresAt: hours(25) }), settings, now), []);
    assert.deepEqual(dueReminders(input({ expiresAt: hours(-1) }), settings, now), [], "already ended");
    assert.deepEqual(dueReminders(input({ expiresAt: hours(23), sent: { ...input().sent, expiringFor: hours(23) } }), settings, now), []);
    // Extended by a top-up, then near its new end: warned again.
    assert.deepEqual(dueReminders(input({ expiresAt: hours(20), sent: { ...input().sent, expiringFor: hours(-100) } }), settings, now), ["expiring"]);
  });

  it("install-by date near and not installed, once per date", () => {
    const waiting = { lifecycle: "not_installed" as const, installed: false, expiresAt: null, totalBytes: null, remainingBytes: null };
    assert.deepEqual(dueReminders(input({ ...waiting, activationDeadline: hours(48) }), settings, now), ["install"]);
    assert.deepEqual(dueReminders(input({ ...waiting, lifecycle: null, activationDeadline: hours(48) }), settings, now), ["install"]);
    assert.deepEqual(dueReminders(input({ ...waiting, activationDeadline: hours(24 * 5) }), settings, now), []);
    assert.deepEqual(dueReminders(input({ ...waiting, installed: true, activationDeadline: hours(48) }), settings, now), []);
    assert.deepEqual(dueReminders(input({ ...waiting, lifecycle: "installed", activationDeadline: hours(48) }), settings, now), []);
    assert.deepEqual(dueReminders(input({ ...waiting, activationDeadline: hours(48), sent: { ...input().sent, installDeadlineFor: hours(48) } }), settings, now), []);
  });

  it("nothing at all for a cancelled eSIM", () => {
    assert.deepEqual(dueReminders(input({ lifecycle: "cancelled", remainingBytes: 1, expiresAt: hours(2) }), settings, now), []);
  });
});

describe("syncIntervalMs", () => {
  it("often while used, rarely while waiting, never once over", () => {
    assert.equal(syncIntervalMs("in_use"), 3_600_000);
    assert.equal(syncIntervalMs("installed"), 3 * 3_600_000);
    assert.equal(syncIntervalMs(null), 12 * 3_600_000);
    assert.equal(syncIntervalMs("not_installed"), 12 * 3_600_000);
    assert.equal(syncIntervalMs("expired"), null);
    assert.equal(syncIntervalMs("depleted"), null);
    assert.equal(syncIntervalMs("cancelled"), null);
  });
});
