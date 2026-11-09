import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CAPTCHA_TTL_MS, captchaSvg, captchaText, captchaToken, checkCaptcha, readCaptchaHeader } from "../captcha";

const SECRET = "test-secret";

describe("picture code", () => {
  it("draws letters that cannot be confused", () => {
    for (let i = 0; i < 50; i += 1) assert.match(captchaText(), /^[ACDEFGHJKMNPQRTUVWXY34679]{4}$/);
    assert.match(captchaSvg("AB3C"), /^<svg[\s\S]*>A<\/text>[\s\S]*<\/svg>$/);
  });

  it("accepts the right answer in any case, and nothing else", () => {
    const now = 1_000_000;
    const token = captchaToken(SECRET, "AC34", now);
    assert.equal(checkCaptcha(SECRET, token, " ac34 ", now).ok, true);
    assert.deepEqual(checkCaptcha(SECRET, token, "AC35", now), { ok: false, reason: "wrong" });
    assert.deepEqual(checkCaptcha(SECRET, token, "AC34", now + CAPTCHA_TTL_MS + 1), { ok: false, reason: "expired" });
    assert.deepEqual(checkCaptcha("other", token, "AC34", now), { ok: false, reason: "malformed" });
    assert.deepEqual(checkCaptcha(SECRET, "", "AC34", now), { ok: false, reason: "missing" });
    const [body, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), exp: now * 10 })).toString("base64url");
    assert.deepEqual(checkCaptcha(SECRET, `${forged}.${signature}`, "AC34", now), { ok: false, reason: "malformed" });
  });

  it("reads the header the forms send", () => {
    assert.deepEqual(readCaptchaHeader("tok.sig|AC34"), { token: "tok.sig", answer: "AC34" });
    assert.deepEqual(readCaptchaHeader(null), { token: "", answer: "" });
  });
});
