import assert from "node:assert/strict";
import { describe, it } from "node:test";
import bcrypt from "bcryptjs";
import { hashPassword } from "better-auth/crypto";
import { checkLegacyPassword, isLegacyHash, verifyAnyPassword } from "../legacy-password";

// Laravel's own prefix; bcryptjs writes $2a$ for the same algorithm.
const laravel = bcrypt.hashSync("old-secret-1", 4).replace(/^\$2a\$/, "$2y$");

describe("migrated passwords", () => {
  it("knows a bcrypt hash from Better Auth's own", async () => {
    assert.equal(isLegacyHash(laravel), true);
    assert.equal(isLegacyHash(bcrypt.hashSync("x", 4)), true);
    assert.equal(isLegacyHash(await hashPassword("new-secret")), false);
    assert.equal(isLegacyHash(""), false);
  });

  it("checks Laravel's $2y$ hashes", async () => {
    assert.equal(await checkLegacyPassword(laravel, "old-secret-1"), true);
    assert.equal(await checkLegacyPassword(laravel, "wrong"), false);
  });

  it("verifies both kinds; Better Auth's own still goes to Better Auth", async () => {
    assert.equal(await verifyAnyPassword({ hash: laravel, password: "old-secret-1" }), true);
    assert.equal(await verifyAnyPassword({ hash: laravel, password: "wrong" }), false);
    const current = await hashPassword("new-secret");
    assert.equal(await verifyAnyPassword({ hash: current, password: "new-secret" }), true);
    assert.equal(await verifyAnyPassword({ hash: current, password: "old-secret-1" }), false);
  });
});
