import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { signInMethod } from "../sign-in-method";

describe("sign-in method", () => {
  it("names how a session was minted", () => {
    assert.equal(signInMethod("/sign-in/email"), "password");
    assert.equal(signInMethod("/sign-in/social"), "social");
    assert.equal(signInMethod("/callback/google"), "social");
    assert.equal(signInMethod("/two-factor/verify-otp"), "two-factor");
    assert.equal(signInMethod("/sign-up/email"), "sign-up");
    assert.equal(signInMethod("/verify-email"), "email-link");
    assert.equal(signInMethod("/sign-in/email-otp"), "email-link");
    assert.equal(signInMethod("/change-password"), "renewed");
    assert.equal(signInMethod("/two-factor/enable"), "renewed");
    assert.equal(signInMethod(null), "other");
    assert.equal(signInMethod("/something-new"), "other");
  });
});
