import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_UNCERTAIN_RETRIES, backoffMs, decide, idempotencyKey, type JobView } from "../policy";

const now = new Date("2026-10-25T12:00:00Z");
const job: JobView = { candidateIndex: 0, candidateCount: 2, candidateAttempts: 0, pendingSince: null };

describe("fulfilment policy", () => {
  it("fails over to the next supplier on a refusal", () => {
    assert.deepEqual(decide(job, { kind: "error", code: "rejected", message: "balance insufficient" }, now), {
      action: "failover",
      candidateIndex: 1,
      reason: "balance insufficient",
    });
  });

  it("gives up when the last supplier refuses", () => {
    const decision = decide({ ...job, candidateIndex: 1 }, { kind: "error", code: "not_found", message: "gone" }, now);
    assert.equal(decision.action, "fail");
  });

  it("never fails over on an uncertain answer, retries the same supplier with backoff", () => {
    const decision = decide(job, { kind: "error", code: "uncertain", message: "timeout" }, now);
    assert.equal(decision.action, "retry");
    assert.equal(decision.action === "retry" && decision.at.getTime() - now.getTime(), 30_000);
    const later = decide({ ...job, candidateAttempts: 3 }, { kind: "error", code: "uncertain", message: "timeout" }, now);
    assert.equal(later.action === "retry" && later.at.getTime() - now.getTime(), 240_000);
  });

  it("hands an unknowable outcome to a person", () => {
    const decision = decide(
      { ...job, candidateAttempts: MAX_UNCERTAIN_RETRIES },
      { kind: "error", code: "invalid_response", message: "garbled" },
      now,
    );
    assert.equal(decision.action, "fail");
    assert.match(decision.action === "fail" ? decision.reason : "", /check with the supplier/);
  });

  it("polls fast, then slow, then gives up after a day", () => {
    const first = decide(job, { kind: "processing", providerOrderId: "o1" }, now);
    assert.equal(first.action === "poll" && first.at.getTime() - now.getTime(), 30_000);
    const tenMinutes = decide(
      { ...job, pendingSince: new Date(now.getTime() - 10 * 60_000) },
      { kind: "processing", providerOrderId: "o1" },
      now,
    );
    assert.equal(tenMinutes.action === "poll" && tenMinutes.at.getTime() - now.getTime(), 120_000);
    const dayLater = decide(
      { ...job, pendingSince: new Date(now.getTime() - 25 * 60 * 60_000) },
      { kind: "processing", providerOrderId: "o1" },
      now,
    );
    assert.equal(dayLater.action, "fail");
  });

  it("caps the backoff and keys idempotency per job and plan", () => {
    assert.equal(backoffMs(20), 30 * 60_000);
    const jobId = "6addc567e2350584ca66c2e7";
    const key = idempotencyKey(jobId, "6addc656e2350584ca66dc16");
    assert.equal(key, `esim-${jobId}-ca66dc16`);
    assert.ok(key.replace(/[^a-zA-Z0-9]/g, "").length <= 50);
    assert.notEqual(key, idempotencyKey(jobId, "6addc656e2350584ca66dc17"));
  });
});
