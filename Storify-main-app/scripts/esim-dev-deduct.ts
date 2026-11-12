/**
 * End-to-end check of an admin deducting store credit (patch P62) against a
 * development database — nothing is charged and no supplier is called.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-deduct.ts
 *
 * Gives a shopper two lots (one expiring, one not), deducts from the one
 * that expires first, then across both, checks the balance, the lots, the
 * ledger entry and the audit row, that the same key deducts once, and that
 * the balance can never go below zero. Removes everything it created and
 * reports any collection whose document count changed. Refuses to run with
 * NODE_ENV=production.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { User } from "@/models";

const tag = `e2e-deduct-${Date.now()}`;
type Id = mongoose.Types.ObjectId;
const created = { users: [] as Id[] };

async function counts() {
  const db = mongoose.connection.db!;
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  return new Map(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const)));
}

async function run() {
  const { issueStoreCredit, storeCreditSummary } = await import("@/lib/store-credit/store-credit");
  const { deductStoreCredit } = await import("@/lib/esim/wallet/admin-deduct");
  const { StoreCreditTransaction } = await import("@/models/store-credit.model");
  const { createSystemAuditContext } = await import("@/lib/audit");
  const db = mongoose.connection.db!;

  const { insertedId: shopper } = await User.collection.insertOne({ email: `${tag}@esim.test`, name: "E2E Shopper", role: "customer", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
  created.users.push(shopper as Id);
  const userId = String(shopper);
  const balance = async () => (await storeCreditSummary(userId)).find((entry) => entry.currency === "USD")?.balance ?? 0;

  const never = await issueStoreCredit({ customerId: userId, currency: "USD", amount: 10, source: "goodwill", createdBy: "e2e", idempotencyKey: `${tag}:never` });
  const soon = await issueStoreCredit({
    customerId: userId,
    currency: "USD",
    amount: 5.3,
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
    source: "goodwill",
    createdBy: "e2e",
    idempotencyKey: `${tag}:soon`,
  });
  assert.equal(await balance(), 15.3);

  const deduct = (amountMinor: number, key: string) =>
    deductStoreCredit({ customerId: userId, currency: "USD", amountMinor, reason: `${tag} check`, adminId: "e2e", idempotencyKey: `${tag}:${key}`, audit: createSystemAuditContext(), customerLabel: `${tag}@esim.test` });

  // 1. From the lot that expires first.
  const first = await deduct(29, "a");
  assert.equal(first.created, true);
  assert.equal(first.row.type, "redeem");
  assert.equal(first.row.source, "admin_deduction");
  assert.equal(first.row.amount, 0.29);
  assert.equal(await balance(), 15.01);
  const soonLot = await StoreCreditTransaction.findById(soon._id).lean<{ remaining: number }>();
  assert.equal(soonLot?.remaining, 5.01, "taken from the expiring lot");
  console.log("✓ 0.29 taken from the lot that expires first");

  // 2. The same key again: nothing more.
  const again = await deduct(29, "a");
  assert.equal(again.created, false);
  assert.equal(String(again.row._id), String(first.row._id));
  assert.equal(await balance(), 15.01);
  console.log("✓ the same key deducts once");

  // 3. Across both lots.
  const across = await deduct(600, "b");
  assert.deepEqual(
    across.row.lots?.map((lot) => [String(lot.lotId), lot.amount]),
    [
      [String(soon._id), 5.01],
      [String(never._id), 0.99],
    ],
  );
  assert.equal(await balance(), 9.01);
  console.log("✓ 6.00 taken across both lots, expiring first");

  // 4. Never below zero.
  await assert.rejects(() => deduct(902, "c"), /more than the customer's balance/);
  assert.equal(await balance(), 9.01, "a refused deduction moves nothing");
  assert.equal(await StoreCreditTransaction.exists({ idempotencyKey: `${tag}:c` }), null);
  const all = await deduct(901, "d");
  assert.equal(all.created, true);
  assert.equal(await balance(), 0);
  await assert.rejects(() => deduct(1, "e"), /no balance/);
  console.log("✓ down to exactly zero, never below");

  // 5. The books and the audit log.
  const entries = await db.collection("ledgerentries").find({ "source.id": { $in: [first.row._id, across.row._id, all.row._id] } }).toArray();
  assert.equal(entries.length, 3);
  for (const entry of entries) {
    assert.equal(entry.debit, "store_credit_payable");
    assert.equal(entry.credit, "promotions");
  }
  assert.deepEqual(entries.map((entry) => entry.amount).sort((a, b) => a - b), [0.29, 6, 9.01]);
  const audits = await db.collection("audit_logs").countDocuments({ resource: "storeCredit", resourceId: { $in: [first.row._id, across.row._id, all.row._id].map(String) } });
  assert.equal(audits, 3);
  console.log("✓ booked debit store credit payable / credit promotions, one audit row each");
  console.log("All deduction checks passed.");
}

async function cleanup() {
  const db = mongoose.connection.db!;
  const rows = await db.collection("storecredittransactions").find({ customerId: { $in: created.users } }).project({ _id: 1 }).toArray();
  const ids = rows.map((row) => row._id);
  await db.collection("ledgerentries").deleteMany({ "source.id": { $in: ids } }).catch(() => undefined);
  await db.collection("audit_logs").deleteMany({ $or: [{ resourceId: { $in: ids.map(String) } }, { resourceName: new RegExp(tag) }] }).catch(() => undefined);
  for (const name of ["storecreditaccounts", "storecredittransactions"]) {
    await db.collection(name).deleteMany({ customerId: { $in: created.users } }).catch(() => undefined);
  }
  await User.collection.deleteMany({ _id: { $in: created.users } });
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against production");
  await connectDB();
  const before = await counts();
  try {
    await run();
  } finally {
    await cleanup().catch((error) => console.error("cleanup failed:", error));
    const after = await counts();
    const changed = [...new Set([...before.keys(), ...after.keys()])]
      .filter((name) => (before.get(name) ?? 0) !== (after.get(name) ?? 0))
      .map((name) => `${name}: ${before.get(name) ?? 0} → ${after.get(name) ?? 0}`);
    console.log(changed.length ? `Collections changed:\n  ${changed.join("\n  ")}` : "Cleanup left every collection as it was.");
  }
}

main()
  .catch((error) => {
    console.error("FAILED:", error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
