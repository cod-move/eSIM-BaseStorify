import assert from "node:assert/strict";
import { test } from "node:test";

import { inviteRedirectFor, publicOrigin, safeReturnPath } from "../link";

test("a page with ?ref= goes through the invite route and back, without the ref", () => {
  assert.equal(inviteRedirectFor("/", "?ref=CJRY52F5"), "/esim/invite/CJRY52F5?to=%2F");
  assert.equal(
    inviteRedirectFor("/zh/esim/japan", "?a=1&ref=CJRY52F5"),
    "/esim/invite/CJRY52F5?to=%2Fzh%2Fesim%2Fjapan%3Fa%3D1",
  );
});

test("nothing to do without a usable code, on the API or on the invite route", () => {
  assert.equal(inviteRedirectFor("/", ""), null);
  assert.equal(inviteRedirectFor("/", "?ref=bad code!"), null);
  assert.equal(inviteRedirectFor("/api/x", "?ref=CJRY52F5"), null);
  assert.equal(inviteRedirectFor("/en/esim/invite/CJRY52F5", "?ref=CJRY52F5"), null);
});

test("the return path stays on this site", () => {
  assert.equal(safeReturnPath("/zh/esim/japan?a=1", "/en/esim"), "/zh/esim/japan?a=1");
  for (const bad of [null, "", "https://evil.example", "//evil.example", "/\\evil", "/en/esim/invite/X"]) {
    assert.equal(safeReturnPath(bad, "/en/esim"), "/en/esim");
  }
});

test("the redirect goes to the visitor's own host, not the address Next listens on", () => {
  const fallback = "http://localhost:3000";
  assert.equal(publicOrigin(new Headers({ "x-forwarded-host": "www.codsim.cc", "x-forwarded-proto": "https" }), fallback), "https://www.codsim.cc");
  assert.equal(publicOrigin(new Headers({ host: "www.codsim.cc", "x-forwarded-proto": "https" }), fallback), "https://www.codsim.cc");
  assert.equal(publicOrigin(new Headers({ host: "evil/x" }), fallback), fallback);
  assert.equal(publicOrigin(new Headers(), fallback), fallback);
});
