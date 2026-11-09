import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { forwardingAllowed, formatSeconds, formatTraffic, historyTotals, historyWindow, isHistoryDays, reconnectSupported, statementMonths } from "@/lib/esim/numbers/service-policy";

describe("number service rules", () => {
  it("forwards calls to any number with its country code", () => {
    assert.equal(forwardingAllowed("447700900123"), true);
    assert.equal(forwardingAllowed("12025550123"), true);
    assert.equal(forwardingAllowed("33612345678"), true);
    assert.equal(forwardingAllowed("8613800138000"), true);
    assert.equal(forwardingAllowed("0613800138000"), false);
    assert.equal(forwardingAllowed("4412"), false);
  });

  it("asks for whole days up to and including today", () => {
    assert.deepEqual(historyWindow(30, new Date("2026-11-09T15:00:00Z")), { from: "2026-10-10", to: "2026-11-10" });
    assert.equal(isHistoryDays(30), true);
    assert.equal(isHistoryDays(365), false);
  });

  it("formats traffic and call length", () => {
    assert.equal(formatTraffic(20_600), "20.1 KB");
    assert.equal(formatTraffic(36_177_280), "34.5 MB");
    assert.equal(formatTraffic(null), "—");
    assert.equal(formatSeconds(125), "2:05");
    assert.equal(formatSeconds(3730), "1:02:10");
  });

  it("totals calls, texts, data and cost", () => {
    const totals = historyTotals(
      [{ kind: "call", costMinor: 42 }, { kind: "sms", costMinor: 24 }, { kind: "call", costMinor: null }],
      [{ bytes: 1000, costMinor: 16 }, { bytes: null, costMinor: 0 }],
    );
    assert.deepEqual(totals, { calls: 2, texts: 1, dataSessions: 2, dataBytes: 1000, costMinor: 82 });
    assert.deepEqual(historyTotals(null, null), { calls: 0, texts: 0, dataSessions: 0, dataBytes: 0, costMinor: 0 });
  });
});

describe("phone bill months", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  it("covers whole past months, oldest first", () => {
    assert.deepEqual(statementMonths("2026-09", "2026-10", now), [
      { month: "2026-09", from: "2026-09-01", to: "2026-10-01" },
      { month: "2026-10", from: "2026-10-01", to: "2026-11-01" },
    ]);
    assert.deepEqual(statementMonths("2025-12", "2025-12", now), [{ month: "2025-12", from: "2025-12-01", to: "2026-01-01" }]);
  });

  it("refuses the current month, reversed ranges and more than twelve", () => {
    assert.equal(typeof statementMonths("2026-11", "2026-11", now), "string");
    assert.equal(typeof statementMonths("2026-10", "2026-09", now), "string");
    assert.equal(typeof statementMonths("2025-09", "2026-10", now), "string");
    assert.equal(typeof statementMonths("2026-13", "2026-10", now), "string");
  });
});

describe("reconnecting a SIM", () => {
  it("is allowed only for the SIM versions TopConnect names, Cyrillic letters included", () => {
    assert.equal(reconnectSupported("8K"), true);
    assert.equal(reconnectSupported("8КО"), true);
    assert.equal(reconnectSupported("7.5М"), true);
    assert.equal(reconnectSupported("Telia postpaid"), true);
    assert.equal(reconnectSupported("9E"), false);
    assert.equal(reconnectSupported(null), null);
  });
});
