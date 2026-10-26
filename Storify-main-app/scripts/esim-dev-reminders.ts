/**
 * End-to-end check of the usage sync and shopper reminders (NTF-03/04/05/07)
 * against a development database, with a fake supplier — nothing is bought.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-reminders.ts
 *
 * Gives a test shopper and a guest some eSIMs in the states that call for a
 * reminder, runs the sync on those eSIMs only, and checks what was sent, that
 * nothing is sent twice and that a top-up arms the low-data reminder again.
 * Removes everything it created and reports any collection whose document
 * count changed. Refuses to run with NODE_ENV=production.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { User } from "@/models";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProfile } from "@/models/esim-profile.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { EsimProviderLog } from "@/models/esim-provider-log.model";
import type { LifecycleStatus } from "@/lib/esim/providers/types";

const tag = `e2e-remind-${Date.now()}`;
type Id = mongoose.Types.ObjectId;
const { ObjectId } = mongoose.Types;
const created = { provider: null as Id | null, plan: null as Id | null, profiles: [] as Id[], users: [] as Id[] };
const GB = 1024 ** 3;
const hours = (n: number) => new Date(Date.now() + n * 3_600_000);

async function counts() {
  const db = mongoose.connection.db!;
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  return new Map(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const)));
}

async function esim(
  n: number,
  fields: { customer: Id | null; email?: string; lifecycle: LifecycleStatus | null; usage?: [number, number]; expiresAt?: Date | null; activationDeadline?: Date | null; synced?: boolean },
) {
  const profile = await EsimProfile.create({
    customer: fields.customer,
    email: fields.email ?? null,
    order: new ObjectId(),
    orderNumber: `${tag}-${n}`,
    lineIndex: 0,
    unit: 1,
    plan: created.plan!,
    providerCode: "fake-fulfil",
    providerEsimId: `fake-${tag}-${n}`,
    iccid: `8999${String(Date.now()).slice(-10)}0000${n}`,
    status: "fulfilled",
    usageAvailable: true,
    lifecycle: { status: fields.lifecycle, installed: fields.lifecycle === "in_use" || fields.lifecycle === "installed" },
    usage: fields.usage ? { totalBytes: fields.usage[0], usedBytes: fields.usage[0] - fields.usage[1], remainingBytes: fields.usage[1], syncedAt: new Date() } : null,
    fulfilledAt: new Date(),
    expiresAt: fields.expiresAt ?? null,
    activationDeadline: fields.activationDeadline ?? null,
    usageSyncedAt: fields.synced === false ? null : new Date(),
  });
  created.profiles.push(profile._id as Id);
  return profile;
}

async function notices(profileId: unknown) {
  const db = mongoose.connection.db!;
  return (await db.collection("notifications").find({ "data.esimId": String(profileId) }).toArray()).map((row) => ({
    kind: row.data?.esimReminder as string,
    link: row.link as string,
  }));
}

async function run() {
  const { runUsageSync } = await import("@/lib/esim/usage/sync");

  let provider = await EsimProvider.findOne({ code: "fake-fulfil" });
  if (!provider) {
    provider = await new EsimProvider({ code: "fake-fulfil", name: "Fake fulfil", status: "active", settlementCurrency: "USD", credentials: { mode: "fulfil" } }).save();
    created.provider = provider._id as Id;
  }
  const plan = await new EsimPlan({
    provider: provider._id,
    providerCode: "fake-fulfil",
    providerPlanId: tag,
    name: "Japan 5GB 30Days",
    slug: tag,
    productSlug: `${tag}-japan`,
    destination: `Japan ${tag}`,
    coverage: { scope: "local", countries: [{ code: "JP", name: "Japan" }], networks: [], breakoutIp: [] },
    data: { megabytes: 5120, label: "5GB", type: "total" },
    validityDays: 30,
    duration: { configurable: false, defaultDays: 30, minDays: 30, maxDays: 30 },
    activation: { billingStarts: "first_connection", preInstallDays: 180 },
    topup: { supported: true, mode: "stack", stackTarget: "data", window: "before_expiry" },
    cost: { currency: "USD", amountMinor: 300, billingUnit: "plan" },
    syncedAt: new Date(),
    contentHash: tag,
    status: "active",
    available: true,
    retailPriceMinor: 699,
  }).save();
  created.plan = plan._id as Id;

  const { insertedId: shopper } = await User.collection.insertOne({ email: `${tag}@esim.test`, name: "E2E Shopper", role: "customer", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
  created.users.push(shopper as Id);

  const low = await esim(1, { customer: shopper as Id, lifecycle: "in_use", usage: [5 * GB, GB / 2], expiresAt: hours(10) });
  const waiting = await esim(2, { customer: shopper as Id, lifecycle: "not_installed", activationDeadline: hours(48) });
  const guest = await esim(3, { customer: null, email: `${tag}-guest@esim.test`, lifecycle: "in_use", usage: [5 * GB, GB / 4], expiresAt: hours(12) });
  const healthy = await esim(4, { customer: shopper as Id, lifecycle: "in_use", usage: [5 * GB, 4 * GB], expiresAt: hours(24 * 20) });
  const stale = await esim(5, { customer: shopper as Id, lifecycle: "installed", synced: false });
  const only = created.profiles;

  // 1. First run: the due reminders, by email and in the account.
  const first = await runUsageSync({ only });
  // Usage only changes when the supplier is asked, so an eSIM is looked at when synced or when a date is near.
  assert.deepEqual(first.reminders, { low_data: 2, expiring: 2, install: 1 }, JSON.stringify(first.reminders));
  const lowNotices = await notices(low._id);
  assert.deepEqual(lowNotices.map((row) => row.kind).sort(), ["expiring", "low_data"]);
  assert.ok(lowNotices.every((row) => row.link.endsWith("/topup")), "low data and ending link to the top-up page");
  assert.deepEqual((await notices(waiting._id)).map((row) => row.kind), ["install"]);
  assert.equal((await notices(guest._id)).length, 0, "a guest gets email only");
  assert.equal((await EsimProfile.findById(guest._id).lean())?.reminders?.lowDataForTotal, 5 * GB, "but the guest's reminder is recorded");
  assert.equal((await notices(healthy._id)).length, 0);
  console.log("✓ first run: low data and plan ending ×2 (one a guest's), install-by; in-app notices for the shopper, linking to top-up");

  // 2. The eSIM not looked at for a while is asked about; the others are not asked again.
  assert.equal(first.synced + first.failed, 1, `one supplier call: ${JSON.stringify(first)}`);
  assert.ok((await EsimProfile.findById(stale._id).lean())?.usageSyncedAt, "the stale eSIM was synced");
  assert.ok(await EsimProviderLog.exists({ "refs.esimId": String(stale._id), operation: "usage" }), "through the supplier, logged");
  console.log("✓ sync: only the eSIM due a look was asked about");

  // 3. Nothing twice.
  const second = await runUsageSync({ only });
  assert.deepEqual(second.reminders, {});
  assert.equal((await notices(low._id)).length, 2);
  console.log("✓ second run: nothing sent again");

  // 4. A top-up raises the allowance; running low again warns again.
  await EsimProfile.updateOne({ _id: low._id }, { $set: { "usage.totalBytes": 6 * GB, "usage.remainingBytes": GB / 2 } });
  const third = await runUsageSync({ only });
  assert.deepEqual(third.reminders, { low_data: 1 });
  console.log("✓ after a top-up: low data warned again for the new allowance");
  console.log("All reminder checks passed.");
}

async function cleanup() {
  const db = mongoose.connection.db!;
  const ids = created.profiles.map(String);
  await db.collection("notifications").deleteMany({ "data.esimId": { $in: ids } });
  await db.collection("emailjobs").deleteMany({ $or: [{ to: new RegExp(tag) }, { dedupeKey: { $in: ids.map((id) => new RegExp(id)) } }] }).catch(() => undefined);
  await EsimProviderLog.deleteMany({ "refs.esimId": { $in: ids } });
  await mongoose.connection.db!.collection("esimpackages").deleteMany({ esim: { $in: created.profiles } });
  await EsimProfile.deleteMany({ _id: { $in: created.profiles } });
  await User.collection.deleteMany({ _id: { $in: created.users } });
  if (created.plan) await EsimPlan.deleteOne({ _id: created.plan });
  if (created.provider) await EsimProvider.deleteOne({ _id: created.provider });
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against production");
  process.env.ESIM_ENABLE_FAKE_PROVIDER = "true";
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
    console.error("FAILED:", error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
