/**
 * End-to-end check of cancelling eSIMs (USR-07/08, patch P4) against a
 * development database, with the fake supplier — nothing is bought.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-cancel.ts
 *
 * A shopper's eSIM on a refundable plan: the offer (its share of what the
 * order collected, less the fee), the cancellation at the supplier and the
 * refund to the balance — once. Then a whole order refunded in Storify: the
 * job not bought yet is stopped, the eSIM not installed is cancelled, the
 * installed one is reported; a partial refund cancels nothing; the eSIM
 * module's own refunds are left alone. Puts the settings back, removes what
 * it made and reports any collection whose count changed. Refuses to run with
 * NODE_ENV=production.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { Order, User } from "@/models";
import { EsimFulfillment } from "@/models/esim-fulfillment.model";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProfile } from "@/models/esim-profile.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { getEsimSettings } from "@/models/esim-pricing.model";

const tag = `e2e-cancel-${Date.now()}`;
type Id = mongoose.Types.ObjectId;
const { ObjectId } = mongoose.Types;
const made = { users: [] as Id[], orders: [] as Id[], plans: [] as Id[], profiles: [] as Id[], jobs: [] as Id[] };
let cancellationBefore: unknown = undefined;

async function counts() {
  const db = mongoose.connection.db!;
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  return new Map(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const)));
}

async function run() {
  process.env.ESIM_ENABLE_FAKE_PROVIDER = "true";
  const cancel = await import("@/lib/esim/cancel/service");
  const { storeCreditSummary } = await import("@/lib/store-credit/store-credit");

  const provider = await EsimProvider.findOne({ code: "fake-fulfil", status: "active" }).lean<{ _id: Id } | null>();
  assert.ok(provider, "the dev database needs the fake-fulfil supplier (run scripts/esim-dev-seed.ts)");
  const settings = await getEsimSettings();
  cancellationBefore = settings.toObject().cancellation;
  settings.cancellation = { enabled: true, feeFixedMinor: 100, feePercent: 0, refundTo: "balance" };
  await settings.save();

  const planId = new ObjectId();
  await EsimPlan.collection.insertOne({
    _id: planId,
    provider: provider._id,
    providerCode: "fake-fulfil",
    providerPlanId: tag,
    name: "Cancel test 1GB",
    slug: tag,
    productSlug: tag,
    destination: "Testland",
    coverage: { scope: "local", countries: [], networks: [], breakoutIp: [] },
    data: { megabytes: 1024, label: "1GB", type: "total" },
    validityDays: 7,
    extras: { voiceMinutes: 0, smsCount: 0, refundable: true, phoneNumberIncluded: false },
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  made.plans.push(planId);

  const { insertedId: shopper } = await User.collection.insertOne({ email: `${tag}@esim.test`, name: "E2E Canceller", emailVerified: true, role: "customer", roles: ["customer"], status: "active", createdAt: new Date(), updatedAt: new Date() });
  made.users.push(shopper as Id);
  const userId = String(shopper);

  const orderOf = async (lines: number, total: number) => {
    const _id = new ObjectId();
    await Order.collection.insertOne({
      _id,
      orderNumber: `${tag}-${made.orders.length + 1}`,
      customerId: shopper,
      status: "delivered",
      paymentStatus: "paid",
      paymentMethod: "card",
      channel: "online",
      currency: "USD",
      subtotal: total,
      discount: 0,
      tax: 0,
      shippingCost: 0,
      total,
      items: Array.from({ length: lines }, () => ({ productId: new ObjectId(), variantId: new ObjectId(), name: "eSIM", sku: "E2E", price: total / lines, quantity: 1 })),
      paidAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    made.orders.push(_id);
    return _id;
  };
  const profileOf = async (order: Id, lineIndex: number, lifecycle: string | null) => {
    const profile = (await EsimProfile.create({
      customer: shopper,
      order,
      orderNumber: `${tag}`,
      lineIndex,
      unit: 1,
      plan: planId,
      providerCode: "fake-fulfil",
      iccid: `8900${Date.now()}${lineIndex}`,
      status: "fulfilled",
      lifecycle: { status: lifecycle, installed: lifecycle === "installed" },
    } as never)) as unknown as { _id: Id };
    made.profiles.push(profile._id as Id);
    return profile;
  };

  // 1. The shopper cancels: 10.00 paid, 1.00 fee, 9.00 to the balance.
  const first = await orderOf(1, 10);
  const mine = await profileOf(first, 0, "not_installed");
  const offer = await cancel.shopperCancelOffer(userId, String(mine._id));
  assert.deepEqual(offer, { allowed: true, paidMinor: 1000, feeMinor: 100, refundMinor: 900, refundTo: "balance" });
  assert.equal((await cancel.shopperCancelOffer(String(new ObjectId()), String(mine._id))), null, "another shopper's eSIM is not found");
  const done = await cancel.cancelByShopper(userId, String(mine._id));
  assert.deepEqual(done, { refundMinor: 900, feeMinor: 100, refund: "balance" });
  const after = await EsimProfile.findById(mine._id).lean();
  assert.equal(after?.status, "refunded");
  assert.equal(after?.lifecycle?.status, "cancelled");
  assert.equal(after?.cancellation?.state, "cancelled");
  assert.equal((await storeCreditSummary(userId)).find((entry) => entry.currency === "USD")?.balance, 9);
  const paidOrder = await Order.findById(first).lean<{ paymentStatus: string; refundedTotal?: number }>();
  assert.equal(paidOrder?.refundedTotal, 9);
  assert.equal(paidOrder?.paymentStatus, "partially_refunded", "the fee stays paid");
  await assert.rejects(cancel.cancelByShopper(userId, String(mine._id)), /already/);
  assert.equal((await storeCreditSummary(userId)).find((entry) => entry.currency === "USD")?.balance, 9, "refunded once");
  console.log("✓ shopper: 10.00 paid, 1.00 fee kept, 9.00 to the balance — once; cancelled at the supplier");

  // 2. Not refundable, installed, or switched off: no offer.
  const installed = await profileOf(await orderOf(1, 5), 0, "installed");
  assert.deepEqual(await cancel.shopperCancelOffer(userId, String(installed._id)), { allowed: false, reason: "installed" });
  settings.cancellation = { enabled: false, feeFixedMinor: 100, feePercent: 0, refundTo: "balance" };
  await settings.save();
  const off = await profileOf(await orderOf(1, 5), 0, "not_installed");
  assert.deepEqual(await cancel.shopperCancelOffer(userId, String(off._id)), { allowed: false, reason: "disabled" });
  console.log("✓ refused: an installed eSIM, and any eSIM while cancellation is off");

  // 3. The whole order refunded in Storify (P4).
  const refundedOrder = await orderOf(3, 30);
  const notInstalled = await profileOf(refundedOrder, 0, "not_installed");
  const inUse = await profileOf(refundedOrder, 1, "installed");
  const job = await EsimFulfillment.collection.insertOne({ order: refundedOrder, orderNumber: tag, lineIndex: 2, unit: 1, state: "queued", candidates: [planId], candidateIndex: 0, attempts: 0, history: [], refund: null, createdAt: new Date(), updatedAt: new Date() });
  made.jobs.push(job.insertedId as Id);
  await cancel.esimOnOrderRefunded({ orderId: refundedOrder, metadata: {} });
  assert.equal((await EsimProfile.findById(notInstalled._id).lean())?.status, "fulfilled", "a partial-looking order (still paid) cancels nothing");
  await Order.updateOne({ _id: refundedOrder }, { $set: { paymentStatus: "refunded" } });
  await cancel.esimOnOrderRefunded({ orderId: refundedOrder, metadata: { esim: true } });
  assert.equal((await EsimProfile.findById(notInstalled._id).lean())?.status, "fulfilled", "the eSIM module's own refund is left alone");
  await cancel.esimOnOrderRefunded({ orderId: refundedOrder, metadata: {} });
  const voided = await EsimProfile.findById(notInstalled._id).lean();
  assert.equal(voided?.status, "refunded");
  assert.equal(voided?.cancellation?.by, "order_refund");
  assert.equal((await EsimProfile.findById(inUse._id).lean())?.status, "fulfilled", "an installed eSIM stays, reported to the admins");
  const stopped = await EsimFulfillment.collection.findOne({ _id: job.insertedId });
  assert.equal(stopped?.state, "failed");
  assert.equal(stopped?.refund?.state, "done", "stopped, and not refunded a second time");
  console.log("✓ order refunded in Storify: the job not bought is stopped, the eSIM not installed cancelled, the installed one reported");
  console.log("All cancellation checks passed.");
}

async function cleanup() {
  const db = mongoose.connection.db!;
  const orders = made.orders;
  const users = [...made.users, ...made.users.map(String)];
  for (const name of ["storecreditaccounts", "storecredittransactions"]) {
    await db.collection(name).deleteMany({ customerId: { $in: made.users } }).catch(() => undefined);
  }
  for (const name of ["paymenttransactions", "ledgerentries", "financeoperations"]) {
    await db.collection(name).deleteMany({ $or: [{ orderId: { $in: orders } }, { "metadata.orderId": { $in: orders.map(String) } }, { "source.id": { $in: orders } }] }).catch(() => undefined);
  }
  const lots = await db.collection("storecredittransactions").find({ customerId: { $in: made.users } }).project({ _id: 1 }).toArray();
  await db.collection("ledgerentries").deleteMany({ "source.id": { $in: lots.map((lot) => lot._id) } }).catch(() => undefined);
  await db.collection("audit_logs").deleteMany({ $or: [{ resourceId: { $in: orders.map(String) } }, { resourceName: new RegExp(tag) }] }).catch(() => undefined);
  await db.collection("notifications").deleteMany({ $or: [{ message: new RegExp(tag) }, { userId: { $in: users } }] }).catch(() => undefined);
  await db.collection("emailjobs").deleteMany({ to: new RegExp(tag) }).catch(() => undefined);
  await db.collection("esimproviderlogs").deleteMany({ "refs.orderId": { $in: orders.map(String) } }).catch(() => undefined);
  await db.collection("esimpackages").deleteMany({ esim: { $in: made.profiles } }).catch(() => undefined);
  await EsimFulfillment.collection.deleteMany({ _id: { $in: made.jobs } });
  await EsimProfile.collection.deleteMany({ _id: { $in: made.profiles } });
  await EsimPlan.collection.deleteMany({ _id: { $in: made.plans } });
  await Order.collection.deleteMany({ _id: { $in: orders } });
  await db.collection("customerprofiles").deleteMany({ userId: { $in: users } }).catch(() => undefined);
  await User.collection.deleteMany({ _id: { $in: made.users } });
  if (cancellationBefore !== undefined) {
    await db.collection("esimsettings").updateOne({ key: "default" }, cancellationBefore ? { $set: { cancellation: cancellationBefore } } : { $unset: { cancellation: "" } });
  }
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
    console.error("FAILED:", error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
