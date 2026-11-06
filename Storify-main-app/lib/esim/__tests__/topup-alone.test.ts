import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mixesTopup } from "@/lib/esim/wallet/mixed";

describe("a top-up is paid on its own", () => {
  const topups = new Set(["topup", "wallet", "number-topup"]);
  const line = (variantId: string) => ({ variantId });

  it("a top-up alone, or with the payment fee, is fine", () => {
    assert.equal(mixesTopup([line("topup")], topups, "fee"), false);
    assert.equal(mixesTopup([line("wallet"), line("fee")], topups, "fee"), false);
  });

  it("ordinary lines alone are fine", () => {
    assert.equal(mixesTopup([line("plan"), line("sim-card"), line("fee")], topups, "fee"), false);
    assert.equal(mixesTopup([], topups, null), false);
  });

  it("a top-up with anything else is refused", () => {
    assert.equal(mixesTopup([line("topup"), line("plan")], topups, "fee"), true);
    assert.equal(mixesTopup([line("number-topup"), line("sim-card"), line("fee")], topups, null), true);
  });
});
