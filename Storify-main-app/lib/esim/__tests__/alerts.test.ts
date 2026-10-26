import assert from "node:assert/strict";
import { describe, it } from "node:test";

// The check alerts.ts uses, from its pure module (alerts.ts itself is server-only).
describe("looksLikeBalanceProblem", async () => {
  const { looksLikeBalanceProblem } = await import("../alerts-words");
  it("reads supplier refusals about money", () => {
    for (const message of ["Insufficient balance", "Not enough credit on account", "insufficient funds", "账户余额不足"]) {
      assert.equal(looksLikeBalanceProblem(message), true, message);
    }
  });
  it("ignores everything else", () => {
    for (const message of ["Package not found", "Timed out", "", null, undefined]) {
      assert.equal(looksLikeBalanceProblem(message), false, String(message));
    }
  });
});
