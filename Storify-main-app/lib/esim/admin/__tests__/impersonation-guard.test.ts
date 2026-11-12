import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blockedWhileImpersonating, hasImpersonationMarker } from "../impersonation-guard";

describe("signed in as a customer", () => {
  it("finds the marker under Better Auth's prefixes", () => {
    assert.equal(hasImpersonationMarker(["better-auth.session_token", "__Secure-better-auth.esim_impersonator"]), true);
    assert.equal(hasImpersonationMarker(["better-auth.esim_impersonator"]), true);
    assert.equal(hasImpersonationMarker(["better-auth.session_token", "esim_ref"]), false);
  });

  it("refuses paying, topping up and account changes", () => {
    for (const path of [
      "/api/payments/checkout",
      "/api/orders",
      "/api/orders/abc/pay",
      "/api/checkout/store-credit",
      "/api/esim/pay/airwallex",
      "/api/esim/checkout/fee",
      "/api/esim/me/wallet",
      "/api/esim/me/esims/abc/topup",
      "/api/esim/me/numbers/abc/transfer",
      "/api/user/change-password",
      "/api/user/profile",
      "/api/auth/change-password",
      "/api/auth/change-email",
      "/api/auth/two-factor/enable",
      "/api/auth/delete-user",
    ]) {
      assert.equal(blockedWhileImpersonating("POST", path), true, path);
    }
  });

  it("lets looking, refreshing and leaving through", () => {
    assert.equal(blockedWhileImpersonating("GET", "/api/orders/abc"), false);
    assert.equal(blockedWhileImpersonating("GET", "/api/esim/me/wallet"), false);
    assert.equal(blockedWhileImpersonating("POST", "/api/esim/me/esims/abc/refresh"), false);
    assert.equal(blockedWhileImpersonating("POST", "/api/auth/esim/stop-impersonating"), false);
    assert.equal(blockedWhileImpersonating("POST", "/api/auth/sign-out"), false);
    assert.equal(blockedWhileImpersonating("POST", "/api/cart"), false);
    assert.equal(blockedWhileImpersonating("POST", "/api/ordersomething"), false);
  });
});
