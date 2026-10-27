/**
 * End-to-end check of signing in with a password migrated from the old store
 * (patch P16) against a development database.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-legacy-login.ts
 *
 * Writes a credential account holding a Laravel bcrypt hash, checks the right
 * password passes and replaces the hash with Better Auth's own (which then
 * still passes), and that a wrong one changes nothing. Removes what it wrote.
 * Refuses to run with NODE_ENV=production.
 */
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { connectDB, disconnectDB, mongoose } from "@/lib/db";

const tag = `e2e-legacy-${Date.now()}`;

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against production");
  await connectDB();
  const { verifyAnyPassword, isLegacyHash } = await import("@/lib/esim/migration/legacy-password");
  const accounts = mongoose.connection.db!.collection("account");
  const before = await accounts.countDocuments();
  const legacy = bcrypt.hashSync("old-secret-1", 10).replace(/^\$2a\$/, "$2y$");
  const { insertedId } = await accounts.insertOne({ providerId: "credential", accountId: tag, userId: new mongoose.Types.ObjectId(), password: legacy, createdAt: new Date(), updatedAt: new Date() });
  try {
    assert.equal(await verifyAnyPassword({ hash: legacy, password: "wrong" }), false);
    assert.equal((await accounts.findOne({ _id: insertedId }))?.password, legacy, "a wrong password changes nothing");
    assert.equal(await verifyAnyPassword({ hash: legacy, password: "old-secret-1" }), true);
    const upgraded = String((await accounts.findOne({ _id: insertedId }))?.password);
    assert.equal(isLegacyHash(upgraded), false, "re-hashed in Better Auth's format");
    assert.equal(await verifyAnyPassword({ hash: upgraded, password: "old-secret-1" }), true, "and the same password still works");
    console.log("✓ a migrated bcrypt password signs in once and is re-hashed; a wrong one changes nothing");
    console.log("All legacy login checks passed.");
  } finally {
    await accounts.deleteOne({ _id: insertedId });
    console.log((await accounts.countDocuments()) === before ? "Cleanup left the accounts as they were." : "Accounts changed!");
  }
}

main()
  .catch((error) => {
    console.error("FAILED:", error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
