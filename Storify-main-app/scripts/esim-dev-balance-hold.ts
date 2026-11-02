/**
 * Check of holding eSIMs while a supplier is out of balance, against a
 * development database, with the fake supplier — nothing is bought.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-balance-hold.ts
 *
 * An order of three eSIMs whose supplier can pay for only one: that one is
 * issued and delivered at once, the other two wait without a refund; once the
 * supplier is topped up they are bought with fresh purchase keys and the order
 * is delivered. A hold that lasts a day fails and is refunded as any failure
 * is. Removes what it made and reports any collection whose count changed,
 * apart from the audit log, notifications and emails. Refuses to run with
 * NODE_ENV=production.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { Order } from "@/models";
import { LedgerEntry } from "@/models/ledger-entry.model";
import { EsimFulfillment } from "@/models/esim-fulfillment.model";
import { EsimPackage } from "@/models/esim-package.model";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProductLink } from "@/models/esim-product-link.model";
import { EsimProfile } from "@/models/esim-profile.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { EsimProviderLog } from "@/models/esim-provider-log.model";

const { ObjectId } = mongoose.Types;
type Id = mongoose.Types.ObjectId;
const tag = `e2e-hold-${Date.now()}`;
const made = { plans: [] as Id[], links: [] as Id[], orders: [] as Id[] };

async function counts() {
  const db = mongoose.connection.db!;
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  return new Map(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const)));
}

async function makePlan(fake: Id, suffix: string) {
  const plan = new EsimPlan({
    provider: fake,
    providerCode: "fake-fulfil",
    providerPlanId: `${tag}-${suffix}`,
    name: `Hold test ${suffix}`,
    slug: `${tag}-${suffix}`,
    productSlug: tag,
    destination: "Testland",
    coverage: { scope: "local", countries: [{ code: "JP", name: "Japan" }], networks: [], breakoutIp: [] },
    data: { megabytes: 1024, label: "1GB", type: "total" },
    validityDays: 7,
    duration: { configurable: false, defaultDays: 7, minDays: 7, maxDays: 7 },
    activation: { billingStarts: "first_connection", preInstallDays: 30 },
    topup: { supported: false, mode: "none", window: null },
    cost: { currency: "USD", amountMinor: 100, billingUnit: "plan" },
    extras: { voiceMinutes: 0, smsCount: 0, refundable: true, phoneNumberIncluded: false },
    syncedAt: new Date(),
    contentHash: `${tag}-${suffix}`,
    status: "active",
    retailPriceMinor: 499,
  });
  await plan.save();
  made.plans.push(plan._id as Id);
  return plan;
}

async function makeOrder(number: string, lines: Array<{ variantId: Id; quantity: number }>) {
  const vendorId = new ObjectId();
  const { insertedId } = await Order.collection.insertOne({
    orderNumber: `${tag}-${number}`,
    customerId: new ObjectId(),
    guestEmail: `${tag}@esim.test`,
    status: "processing",
    paymentStatus: "paid",
    paymentMethod: "stripe",
    channel: "online",
    currency: "USD",
    subtotal: 4.99 * lines.reduce((sum, line) => sum + line.quantity, 0),
    discount: 0,
    tax: 0,
    shippingCost: 0,
    total: 4.99 * lines.reduce((sum, line) => sum + line.quantity, 0),
    items: lines.map((line) => ({ productId: new ObjectId(), variantId: line.variantId, vendorId, name: "Test eSIM", sku: "TEST", price: 4.99, quantity: line.quantity })),
    subOrders: [{ _id: new ObjectId(), vendorId, status: "processing", items: [] }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  made.orders.push(insertedId as Id);
  return String(insertedId);
}

async function run() {
  process.env.ESIM_ENABLE_FAKE_PROVIDER = "true";
  const fulfilment = await import("@/lib/esim/fulfillment");
  const { settleOrderDelivery } = await import("@/lib/esim/fulfillment/delivery");
  const fake = await EsimProvider.findOne({ code: "fake-fulfil", status: "active" }).lean<{ _id: Id } | null>();
  assert.ok(fake, "the dev database needs the active fake-fulfil supplier (run scripts/esim-dev-seed.ts)");

  const paying = await makePlan(fake._id, "ok");
  const broke = await makePlan(fake._id, "broke");
  const okVariant = new ObjectId();
  const brokeVariant = new ObjectId();
  const link = new EsimProductLink({
    productSlug: tag,
    product: new ObjectId(),
    variants: [
      { key: "total|1024|7", variantId: okVariant, name: "1GB / 7 days", priceMinor: 499, candidates: [paying._id] },
      { key: "total|1024|8", variantId: brokeVariant, name: "1GB / 8 days", priceMinor: 499, candidates: [broke._id] },
    ],
    publishedAt: new Date(),
  });
  await link.save();
  made.links.push(link._id as Id);

  console.log("1. the supplier pays for one of three: it is delivered, the other two wait unrefunded");
  const order = await makeOrder("1", [{ variantId: okVariant, quantity: 1 }, { variantId: brokeVariant, quantity: 2 }]);
  await fulfilment.esimQueueOrder(order);
  await fulfilment.esimFulfilOrder(order);
  let jobs = await EsimFulfillment.find({ order: order }).sort({ lineIndex: 1, unit: 1 }).lean();
  assert.deepEqual(jobs.map((job) => job.state), ["fulfilled", "queued", "queued"]);
  assert.ok(jobs[0].deliveredAt, "the issued eSIM is emailed at once");
  assert.ok(jobs.slice(1).every((job) => job.balanceHold?.rounds === 1 && !job.refund));
  assert.ok(jobs[1].nextAttemptAt.getTime() > Date.now() + 9 * 60_000, "tried again in about 10 minutes");
  assert.equal(await settleOrderDelivery(order), "waiting");
  assert.equal((await Order.findById(order).select({ status: 1 }).lean<{ status: string }>())?.status, "processing");

  console.log("2. topped up: the two are bought with fresh keys and the order is delivered");
  await EsimPlan.updateOne({ _id: broke._id }, { $set: { providerPlanId: `${tag}-paid` } });
  await EsimFulfillment.updateMany({ order: order, state: "queued" }, { $set: { nextAttemptAt: new Date() } });
  await fulfilment.esimFulfilOrder(order);
  jobs = await EsimFulfillment.find({ order: order }).sort({ lineIndex: 1, unit: 1 }).lean();
  assert.deepEqual(jobs.map((job) => job.state), ["fulfilled", "fulfilled", "fulfilled"]);
  assert.ok(jobs.every((job) => job.deliveredAt && !job.balanceHold));
  const keys = await EsimProviderLog.find({ "refs.orderId": order, operation: "purchase" }).select({ request: 1 }).lean();
  assert.ok(keys.length >= 5, "one purchase for the first eSIM, two refused and two bought for the others");
  assert.equal((await Order.findById(order).select({ status: 1 }).lean<{ status: string }>())?.status, "delivered");

  console.log("3. a hold that lasts a day fails, and the guest's refund goes to a person");
  await EsimPlan.updateOne({ _id: broke._id }, { $set: { providerPlanId: `${tag}-broke-again` } });
  const late = await makeOrder("2", [{ variantId: brokeVariant, quantity: 1 }]);
  await fulfilment.esimQueueOrder(late);
  await fulfilment.esimFulfilOrder(late);
  await EsimFulfillment.updateOne({ order: late }, { $set: { "balanceHold.since": new Date(Date.now() - 25 * 60 * 60_000), nextAttemptAt: new Date() } });
  await fulfilment.esimFulfilOrder(late);
  const [lateJob] = await EsimFulfillment.find({ order: late }).lean();
  assert.equal(lateJob.state, "failed");
  assert.equal(lateJob.refund?.state, "manual");
  console.log("All balance hold checks passed.");
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against production");
  await connectDB();
  const before = await counts();
  try {
    await run();
  } finally {
    const profiles = await EsimProfile.find({ order: { $in: made.orders } }).select({ _id: 1 }).lean();
    await EsimPackage.deleteMany({ esim: { $in: profiles.map((profile) => profile._id) } });
    await EsimProfile.deleteMany({ order: { $in: made.orders } });
    await EsimFulfillment.deleteMany({ order: { $in: made.orders } });
    await EsimProviderLog.deleteMany({ $or: [{ "refs.orderId": { $in: made.orders.map(String) } }, { "refs.planId": { $in: made.plans.map(String) } }] });
    await LedgerEntry.deleteMany({ "source.id": { $in: made.orders } });
    await Order.collection.deleteMany({ _id: { $in: made.orders } });
    await EsimProductLink.deleteMany({ _id: { $in: made.links } });
    await EsimPlan.deleteMany({ _id: { $in: made.plans } });
    // Delivery and delay emails are sent, an order's status change is audited and admins are alerted, on purpose.
    const kept = new Set(["audit_logs", "notifications", "email_deliveries", "emaildeliveries"]);
    const after = await counts();
    const changed = [...after].filter(([name, count]) => !kept.has(name) && (before.get(name) ?? 0) !== count);
    console.log(changed.length ? `Collections changed: ${JSON.stringify(changed)}` : "Cleanup left every collection as it was.");
    await disconnectDB();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
