/**
 * End-to-end check of the import from the old store (MIG, patches P16 and
 * P20) against a development database — with sample rows, never a real
 * MySQL database.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-migration.ts
 *
 * Counts first (nothing written), then imports: a new shopper with their old
 * bcrypt password (which signs in), one matched to an account that already
 * has the email (password untouched), an unverified one left out; a balance
 * as store credit with its opening-balance ledger entry; the referral; two
 * active eSIMs on one import order, and one whose plan is not here left out.
 * A second import changes nothing. Removes everything it created and
 * reports any collection whose document count changed. Refuses to run with
 * NODE_ENV=production.
 */
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { Order, User } from "@/models";
import { EsimLegacyLink } from "@/models/esim-legacy.model";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProfile } from "@/models/esim-profile.model";
import { EsimReferral, EsimReferralCode } from "@/models/esim-referral.model";
import type { LegacyEsimRow, LegacyUserRow } from "@/lib/esim/migration/legacy-rows";
import { keepTopupProductAsItWas } from "./lib/esim-topup-product";

const tag = `e2e-mig-${Date.now()}`;
type Id = mongoose.Types.ObjectId;
// Legacy ids far above any real one, so the links cannot collide with a real import.
const BASE = 900_000_000 + (Date.now() % 1_000_000);
const PASSWORD = "old-store-secret";
const created = { existingUser: null as Id | null };

async function counts() {
  const db = mongoose.connection.db!;
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  return new Map(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const)));
}

function userRow(id: number, overrides: Partial<LegacyUserRow> = {}): LegacyUserRow {
  return {
    id,
    firstname: "Old",
    lastname: `Shopper ${id}`,
    username: null,
    email: `${tag}-${id}@esim.test`,
    dial_code: "44",
    mobile: "7700900123",
    ref_by: 0,
    balance: "0.00000000",
    password: bcrypt.hashSync(PASSWORD, 4).replace(/^\$2a\$/, "$2y$"),
    country_code: "GB",
    city: "London",
    state: null,
    zip: "N1",
    address: "1 Old Street",
    status: 1,
    ev: 1,
    sv: 1,
    created_at: new Date("2025-03-01T00:00:00Z"),
    updated_at: null,
    ...overrides,
  };
}

function esimRow(id: number, userId: number, plan: { providerCode: string; providerPlanId: string }, iccid: string): LegacyEsimRow {
  return {
    id,
    user_id: userId,
    provider_slug: plan.providerCode,
    provider_plan_id: plan.providerPlanId,
    plan_name: "Old plan",
    purchase_id: `OLD-${id}`,
    serial_number: null,
    provider_sim_id: null,
    iccid,
    phone_number: null,
    qr_code: `LPA:1$smdp.example$${tag}-${id}`,
    activation_deadline: null,
    expiry_date: new Date(Date.now() + 30 * 86_400_000),
    profile_status: "installed",
    remark: null,
    info: null,
    status: 1,
    created_at: new Date("2026-09-01T00:00:00Z"),
  };
}

async function run() {
  const { runLegacyImport } = await import("@/lib/esim/migration/import");
  const { applyDependencies } = await import("@/lib/esim/admin/migration");
  const { verifyAnyPassword, isLegacyHash } = await import("@/lib/esim/migration/legacy-password");
  const { storeCreditSummary } = await import("@/lib/store-credit/store-credit");

  const plan = await EsimPlan.findOne().select("providerCode providerPlanId").lean<{ providerCode: string; providerPlanId: string }>();
  assert.ok(plan, "the dev database needs one eSIM plan (run scripts/esim-dev-seed.ts)");

  // An account that already has an old shopper's email here.
  const { insertedId } = await User.collection.insertOne({ name: "Signed up here", email: `${tag}-${BASE + 2}@esim.test`, emailVerified: true, role: "customer", roles: ["customer"], status: "active", createdAt: new Date(), updatedAt: new Date() });
  created.existingUser = insertedId as Id;

  const referrer = userRow(BASE + 1);
  const snapshot = {
    users: [
      referrer,
      userRow(BASE + 2),
      userRow(BASE + 3, { balance: "12.34500000", ref_by: BASE + 1 }),
      userRow(BASE + 4, { ev: 0 }),
    ],
    esims: [
      esimRow(BASE + 10, BASE + 3, plan, `89${String(BASE)}01`),
      esimRow(BASE + 11, BASE + 3, plan, `89${String(BASE)}02`),
      esimRow(BASE + 12, BASE + 3, { providerCode: plan.providerCode, providerPlanId: `${tag}-missing` }, `89${String(BASE)}03`),
      { ...esimRow(BASE + 13, BASE + 3, plan, `89${String(BASE)}04`), status: 3 },
    ],
  };

  // 1. Check: counts only.
  const check = await runLegacyImport(snapshot, { apply: false });
  assert.deepEqual(
    { users: check.report["users.new"], matched: check.report["users.matched"], balances: check.report["balances.new"], total: check.report["balances.totalMinor"], referrals: check.report["referrals.new"] },
    { users: 2, matched: 1, balances: 1, total: 1235, referrals: 1 },
  );
  assert.equal(check.skipped["user.unverified"], 1);
  assert.equal(check.skipped["esim.not-active"], 1);
  assert.equal(await EsimLegacyLink.countDocuments({ legacyId: { $gte: BASE, $lt: BASE + 100 } }), 0, "a check writes nothing");
  assert.equal(await User.countDocuments({ email: new RegExp(tag) }), 1);
  console.log("✓ check: 2 new, 1 matched, 1 unverified left out, 12.35 of balance, 1 referral; nothing written");

  // 2. Import.
  const deps = await applyDependencies();
  const first = await runLegacyImport(snapshot, deps);
  assert.equal(first.report["users.new"], 2);
  assert.equal(first.report["esims.new"], 2);
  assert.equal(first.skipped[`esim.no-plan:${plan.providerCode}`], 1);

  const newUser = await User.findOne({ email: `${tag}-${BASE + 3}@esim.test` }).lean<{ _id: Id; name: string; status: string; emailVerified: boolean; phone?: string }>();
  assert.ok(newUser);
  assert.equal(newUser.name, `Old Shopper ${BASE + 3}`);
  assert.equal(newUser.emailVerified, true);
  assert.equal(newUser.phone, "+447700900123");
  const account = await mongoose.connection.db!.collection("account").findOne({ userId: newUser._id, providerId: "credential" });
  assert.ok(account && isLegacyHash(String(account.password)), "the old bcrypt hash, as it was");
  assert.equal(await verifyAnyPassword({ hash: String(account.password), password: PASSWORD }), true, "the old password signs in");
  assert.equal(await mongoose.connection.db!.collection("account").countDocuments({ userId: created.existingUser }), 0, "the matched account's password is not touched");
  console.log("✓ users: created with their old password (which signs in); the existing account linked, untouched");

  const balance = (await storeCreditSummary(String(newUser._id))).find((entry) => entry.currency === deps.currency)?.balance;
  assert.equal(balance, 12.35);
  const entry = await mongoose.connection.db!.collection("ledgerentries").findOne({ "source.ref": `legacy-user-${BASE + 3}` });
  assert.equal(entry?.debit, "opening_balance_equity");
  assert.equal(entry?.credit, "store_credit_payable");
  assert.equal(entry?.amount, 12.35);
  const referral = await EsimReferral.findOne({ referee: newUser._id }).lean();
  assert.ok(referral, "the referral");
  console.log("✓ balance: 12.35 store credit, debit opening balance equity / credit store-credit payable; referral kept");

  const profiles = await EsimProfile.find({ customer: newUser._id }).sort({ lineIndex: 1 }).lean();
  assert.equal(profiles.length, 2);
  assert.deepEqual(profiles.map((profile) => profile.lineIndex), [0, 1]);
  assert.equal(profiles[0].installation.matchingId, `${tag}-${BASE + 10}`);
  assert.equal(profiles[0].status, "fulfilled");
  const order = await Order.findOne({ orderNumber: `MIG-${BASE + 3}` }).lean<{ _id: Id; total: number; paymentStatus: string; items: unknown[] }>();
  assert.ok(order);
  assert.equal(order.total, 0);
  assert.equal(order.items.length, 2);
  assert.equal(String(profiles[0].order), String(order._id));
  assert.equal(await mongoose.connection.db!.collection("ledgerentries").countDocuments({ "source.id": order._id }), 0, "the import order books nothing");
  console.log("✓ eSIMs: 2 on one zero-value import order (nothing booked); the one without a plan here left out");

  // 3. Again: nothing new.
  const second = await runLegacyImport(snapshot, deps);
  assert.equal(second.report["users.new"] ?? 0, 0);
  assert.equal(second.report["users.already"], 3);
  assert.equal(second.report["balances.new"] ?? 0, 0);
  assert.equal(second.report["esims.new"] ?? 0, 0);
  assert.equal(second.report["esims.already"], 2);
  assert.equal((await storeCreditSummary(String(newUser._id))).find((row) => row.currency === deps.currency)?.balance, 12.35);
  console.log("✓ a second import changes nothing");
  console.log("All migration checks passed.");
}

async function cleanup() {
  const db = mongoose.connection.db!;
  const users = await User.collection.find({ email: new RegExp(tag) }).project({ _id: 1 }).toArray();
  const ids = users.map((user) => user._id as Id);
  const both = [...ids, ...ids.map(String)];
  const orders = (await Order.collection.find({ orderNumber: new RegExp(`^MIG-(${Array.from({ length: 10 }, (_, i) => BASE + i).join("|")})$`) }).project({ _id: 1 }).toArray()).map((row) => row._id);
  const lots = await db.collection("storecredittransactions").find({ customerId: { $in: ids } }).project({ _id: 1 }).toArray();
  await db.collection("ledgerentries").deleteMany({ "source.id": { $in: lots.map((lot) => lot._id) } });
  for (const name of ["storecreditaccounts", "storecredittransactions"]) await db.collection(name).deleteMany({ customerId: { $in: ids } });
  await EsimProfile.collection.deleteMany({ customer: { $in: ids } });
  await Order.collection.deleteMany({ _id: { $in: orders } });
  await EsimReferral.collection.deleteMany({ $or: [{ referee: { $in: ids } }, { referrer: { $in: ids } }] });
  await EsimReferralCode.collection.deleteMany({ user: { $in: ids } });
  await db.collection("customerprofiles").deleteMany({ userId: { $in: both } });
  await db.collection("account").deleteMany({ userId: { $in: ids } });
  await db.collection("notifications").deleteMany({ $or: [{ message: new RegExp(tag) }, { userId: { $in: both } }] }).catch(() => undefined);
  await EsimLegacyLink.collection.deleteMany({ legacyId: { $gte: BASE, $lt: BASE + 100 } });
  await User.collection.deleteMany({ _id: { $in: ids } });
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against production");
  await connectDB();
  const before = await counts();
  const restoreProducts = await keepTopupProductAsItWas();
  try {
    await run();
  } finally {
    await cleanup().catch((error) => console.error("cleanup failed:", error));
    await restoreProducts().catch((error) => console.error("product cleanup failed:", error));
    const after = await counts();
    const changed = [...new Set([...before.keys(), ...after.keys()])]
      .filter((name) => (before.get(name) ?? 0) !== (after.get(name) ?? 0))
      .map((name) => `${name}: ${before.get(name) ?? 0} → ${after.get(name) ?? 0}`);
    console.log(changed.length ? `Collections changed:\n  ${changed.join("\n  ")}` : "Cleanup left every collection as it was.");
  }
}

main()
  .catch((error) => {
    console.error("FAILED:", error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
