import { test } from "node:test";
import assert from "node:assert/strict";
import { alertDay, balanceAlertOf } from "./balance-policy";

test("balance notices: empty at or under zero, low at or under 0.02, none above or unknown", () => {
  assert.equal(balanceAlertOf(-15), "empty");
  assert.equal(balanceAlertOf(0), "empty");
  assert.equal(balanceAlertOf(1), "low");
  assert.equal(balanceAlertOf(2), "low");
  assert.equal(balanceAlertOf(3), null);
  assert.equal(balanceAlertOf(null), null);
  assert.equal(balanceAlertOf(undefined), null);
});

test("alert day is the UTC date", () => {
  assert.equal(alertDay(new Date("2026-11-20T04:00:00Z")), "2026-11-20");
});
