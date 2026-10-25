/**
 * End-to-end check of eSIM fulfilment against a development database, with
 * fake suppliers — nothing is bought from a real supplier.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-fulfilment.ts
 *
 * Creates fake suppliers, plans, a product link and paid orders, drives each
 * scenario through queueing, purchase, failover, polling and delivery, checks
 * the outcome, then removes everything it created. Refuses to run with
 * NODE_ENV=production.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { Order, User } from "@/models";
import { EsimFulfillment } from "@/models/esim-fulfillment.model";
import { EsimPackage } from "@/models/esim-package.model";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProductLink } from "@/models/esim-product-link.model";
import { EsimProfile } from "@/models/esim-profile.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { EsimProviderLog } from "@/models/esim-provider-log.model";

const { ObjectId } = mongoose.Types;
const tag = `e2e-${Date.now()}`;
type Id = mongoose.Types.ObjectId;
const created = { providers: [] as Id[], plans: [] as Id[], orders: [] as Id[], links: [] as Id[], users: [] as Id[] };

async function fakeProvider(mode: string) {
  const code = `fake-${mode}`;
  await EsimProvider.deleteOne({ code });
  const provider = await EsimProvider.create({
    code,
    name: `Fake ${mode}`,
    status: "active",
    settlementCurrency: "USD",
    credentials: { mode },
  });
  created.providers.push(provider._id as Id);
  return provider;
}

async function fakePlan(providerId: Id, providerCode: string, window: "before_expiry" | "while_profile_exists") {
  const plan = new EsimPlan({
    provider: providerId,
    providerCode,
    providerPlanId: `${tag}-${providerCode}`,
    name: `Test 1GB 7Days (${providerCode})`,
    slug: `${tag}-${providerCode}`,
    productSlug: tag,
    destination: "Testland",
    coverage: { scope: "local", countries: [{ code: "JP", name: "Japan" }], networks: [], breakoutIp: [] },
    data: { megabytes: 1024, label: "1GB", type: "total" },
    validityDays: 7,
    duration: { configurable: false, defaultDays: 7, minDays: 7, maxDays: 7 },
    activation: { billingStarts: "first_connection", preInstallDays: 180 },
    topup: { supported: true, mode: "stack", stackTarget: "data", window, coverage: "same_area" },
    cost: { currency: "USD", amountMinor: 100, billingUnit: "plan" },
    syncedAt: new Date(),
    contentHash: tag,
    status: "active",
    retailPriceMinor: 199,
  });
  await plan.save();
  created.plans.push(plan._id as Id);
  return plan;
}

async function paidOrder(variantId: Id, quantity = 1) {
  return paidOrderOf([{ variantId, quantity, price: 1.99 }], { guest: true });
}

/** A paid order; `total` below the line sum stands for a coupon. */
async function paidOrderOf(
  lines: Array<{ variantId: Id; quantity: number; price: number }>,
  options: { guest: boolean; customerId?: Id; total?: number },
) {
  const vendorId = new ObjectId();
  const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const { insertedId } = await Order.collection.insertOne({
    orderNumber: `${tag}-${created.orders.length + 1}`,
    customerId: options.customerId ?? new ObjectId(),
    ...(options.guest ? { guestEmail: "guest@esim.test" } : {}),
    status: "processing",
    paymentStatus: "paid",
    paymentMethod: "stripe",
    channel: "online",
    currency: "USD",
    subtotal,
    discount: Math.round((subtotal - (options.total ?? subtotal)) * 100) / 100,
    tax: 0,
    shippingCost: 0,
    total: options.total ?? subtotal,
    items: lines.map((line) => ({
      productId: new ObjectId(), variantId: line.variantId, vendorId, name: "Test eSIM", sku: "TEST", price: line.price, quantity: line.quantity,
    })),
    subOrders: [{ _id: new ObjectId(), vendorId, status: "processing", items: [] }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  created.orders.push(insertedId as Id);
  return String(insertedId);
}

async function testCustomer() {
  const { insertedId } = await User.collection.insertOne({
    email: `${tag}@esim.test`,
    name: "E2E Shopper",
    role: "customer",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  created.users.push(insertedId as Id);
  return insertedId as Id;
}

async function link(candidates: Id[]) {
  const variantId = new ObjectId();
  const doc = new EsimProductLink({
    productSlug: `${tag}-${created.links.length + 1}`,
    product: new ObjectId(),
    variants: [{ key: "total|1024|7", variantId, name: "1GB / 7 days", priceMinor: 199, candidates }],
    publishedAt: new Date(),
  });
  await doc.save();
  created.links.push(doc._id as Id);
  return variantId;
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against production");
  process.env.ESIM_ENABLE_FAKE_PROVIDER = "true";
  await connectDB();
  const fulfilment = await import("@/lib/esim/fulfillment");
  const { processFulfillmentJobs } = await import("@/lib/esim/fulfillment/service");
  const { settleOrderDelivery } = await import("@/lib/esim/fulfillment/delivery");

  const ok = await fakeProvider("fulfil");
  const reject = await fakeProvider("reject");
  const pending = await fakeProvider("pending");
  const uncertain = await fakeProvider("uncertain");
  const okPlan = await fakePlan(ok._id, ok.code, "before_expiry");
  const rejectPlan = await fakePlan(reject._id, reject.code, "before_expiry");
  const pendingPlan = await fakePlan(pending._id, pending.code, "while_profile_exists");
  const uncertainPlan = await fakePlan(uncertain._id, uncertain.code, "before_expiry");

  console.log("1. refusal fails over to the next supplier; two units; delivery marks the order delivered");
  const order1 = await paidOrder(await link([rejectPlan._id, okPlan._id]), 2);
  assert.equal(await fulfilment.esimQueueOrder(order1), 2);
  assert.equal(await fulfilment.esimQueueOrder(order1), 0, "queueing twice adds nothing");
  await fulfilment.esimFulfilOrder(order1);
  const jobs1 = await EsimFulfillment.find({ order: order1 }).lean();
  assert.ok(jobs1.every((job) => job.state === "fulfilled" && job.candidateIndex === 1), "both units fulfilled by the second supplier");
  assert.ok(jobs1[0].history.some((entry) => entry.event === "failover"));
  const profiles1 = await EsimProfile.find({ order: order1 }).lean();
  assert.equal(profiles1.length, 2);
  assert.equal(new Set(profiles1.map((profile) => profile.iccid)).size, 2, "each unit its own eSIM");
  assert.ok(profiles1.every((profile) => profile.installation.activationCode?.startsWith("LPA:1$")));
  assert.equal(profiles1[0].email, "guest@esim.test");
  assert.equal(await EsimPackage.countDocuments({ esim: { $in: profiles1.map((profile) => profile._id) }, kind: "base" }), 2);
  const order1Doc = await Order.findById(order1).lean<{ status: string; subOrders: Array<{ status: string }> }>();
  assert.equal(order1Doc?.status, "delivered");
  assert.equal(order1Doc?.subOrders[0].status, "delivered");
  console.log("   ok — order delivered, 2 eSIMs, failover recorded");

  console.log("2. a supplier that answers 'processing' is polled until it delivers");
  const order2 = await paidOrder(await link([pendingPlan._id]));
  await fulfilment.esimQueueOrder(order2);
  await processFulfillmentJobs({ orderId: order2 });
  let job2 = await EsimFulfillment.findOne({ order: order2 }).lean();
  assert.equal(job2?.state, "provider_pending");
  assert.ok(job2!.nextAttemptAt > new Date(), "next poll is scheduled, not immediate");
  await EsimFulfillment.updateOne({ _id: job2!._id }, { $set: { nextAttemptAt: new Date() } });
  await fulfilment.esimFulfilOrder(order2);
  job2 = await EsimFulfillment.findOne({ order: order2 }).lean();
  assert.equal(job2?.state, "fulfilled");
  const profile2 = await EsimProfile.findOne({ order: order2 }).lean();
  assert.equal(profile2?.profileExpiresAt, null, "while_profile_exists plans keep the profile");
  console.log("   ok — pending, polled, fulfilled");

  console.log("3. an uncertain answer is retried on the same supplier, never failed over");
  const order3 = await paidOrder(await link([uncertainPlan._id, okPlan._id]));
  await fulfilment.esimQueueOrder(order3);
  await processFulfillmentJobs({ orderId: order3 });
  const job3 = await EsimFulfillment.findOne({ order: order3 }).lean();
  assert.equal(job3?.state, "queued");
  assert.equal(job3?.candidateIndex, 0, "still on the first supplier");
  assert.equal(job3?.candidateAttempts, 1);
  assert.ok(job3!.nextAttemptAt.getTime() > Date.now() + 20_000, "backed off");
  console.log("   ok — retry scheduled on the same supplier");

  console.log("4. every supplier refusing a guest order: failed, refund left to a person");
  const order4 = await paidOrder(await link([rejectPlan._id]));
  await fulfilment.esimQueueOrder(order4);
  await fulfilment.esimFulfilOrder(order4);
  const job4 = await EsimFulfillment.findOne({ order: order4 }).lean();
  assert.equal(job4?.state, "failed");
  assert.equal(job4?.refund?.state, "manual", "guests are refunded by hand");
  assert.equal(job4?.refund?.amount, 1.99);
  assert.equal(await settleOrderDelivery(order4), "failed");
  assert.equal((await Order.findById(order4).lean<{ status: string; paymentStatus: string }>())?.paymentStatus, "paid");
  console.log("   ok — failed, guest refund handed to admins");

  console.log("6. a registered shopper's order half fails: the issued eSIM is delivered, the failed one credited");
  const shopper = await testCustomer();
  const okVariant = await link([okPlan._id]);
  const badVariant = await link([rejectPlan._id]);
  // 4.99 + 9.99 = 14.98, a coupon makes it 11.98: the failed line's share is 7.98.
  const order6 = await paidOrderOf(
    [{ variantId: okVariant, quantity: 1, price: 4.99 }, { variantId: badVariant, quantity: 1, price: 9.99 }],
    { guest: false, customerId: shopper, total: 11.98 },
  );
  await fulfilment.esimQueueOrder(order6);
  await fulfilment.esimFulfilOrder(order6);
  const jobs6 = await EsimFulfillment.find({ order: order6 }).sort({ lineIndex: 1 }).lean();
  assert.equal(jobs6[0].state, "fulfilled");
  assert.ok(jobs6[0].deliveredAt, "the issued eSIM went out despite the other failing");
  assert.equal(jobs6[1].state, "failed");
  assert.equal(jobs6[1].refund?.state, "done");
  assert.equal(jobs6[1].refund?.amount, 7.98);
  const order6Doc = await Order.findById(order6).lean<{ status: string; paymentStatus: string; refundedTotal: number; refundInFlightAt?: Date }>();
  assert.equal(order6Doc?.paymentStatus, "partially_refunded");
  assert.equal(order6Doc?.refundedTotal, 7.98);
  assert.equal(order6Doc?.refundInFlightAt, undefined, "in-flight stamp cleared");
  assert.equal(order6Doc?.status, "processing", "a partly failed order is not marked delivered");
  const { storeCreditSummary } = await import("@/lib/store-credit/store-credit");
  const balance = await storeCreditSummary(String(shopper));
  assert.equal(JSON.stringify(balance).includes("7.98"), true, `store credit shows 7.98: ${JSON.stringify(balance)}`);
  assert.equal(await settleOrderDelivery(order6), "partial");
  assert.equal((await Order.findById(order6).lean<{ refundedTotal: number }>())?.refundedTotal, 7.98, "settling again refunds nothing more");
  console.log("   ok — delivered one, credited 7.98, no double refund");

  console.log("7. a registered shopper's order fails completely: full refund to store credit");
  const order7 = await paidOrderOf([{ variantId: badVariant, quantity: 2, price: 4.99 }], { guest: false, customerId: shopper });
  await fulfilment.esimQueueOrder(order7);
  await fulfilment.esimFulfilOrder(order7);
  const order7Doc = await Order.findById(order7).lean<{ paymentStatus: string; refundedTotal: number }>();
  assert.equal(order7Doc?.paymentStatus, "refunded");
  assert.equal(order7Doc?.refundedTotal, 9.98);
  console.log("   ok — refunded 9.98 in full");

  console.log("5. the cron sweep queues a paid order that was never queued");
  const order5 = await paidOrder(await link([okPlan._id]));
  const cron = await fulfilment.runFulfilmentCron();
  assert.ok(cron.swept >= 1);
  assert.equal((await EsimFulfillment.findOne({ order: order5 }).lean())?.state, "fulfilled");
  console.log("   ok — swept and fulfilled");

  const logs = await EsimProviderLog.find({ providerCode: /^fake-/ }).lean();
  assert.ok(logs.length > 0);
  assert.ok(!JSON.stringify(logs).includes("LPA:1$"), "activation codes never reach the log");
  console.log(`All scenarios passed (${logs.length} supplier calls logged, none with an activation code).`);
}

async function cleanup() {
  const orders = created.orders;
  const profiles = await EsimProfile.find({ order: { $in: orders } }).select({ _id: 1 }).lean();
  await EsimPackage.deleteMany({ esim: { $in: profiles.map((profile) => profile._id) } });
  await EsimProfile.deleteMany({ order: { $in: orders } });
  await EsimFulfillment.deleteMany({ order: { $in: orders } });
  // What the store-credit refunds wrote, keyed by the test orders and shopper.
  const db = mongoose.connection.db!;
  const byTag = new RegExp(tag);
  for (const name of ["paymenttransactions", "ledgerentries", "financeoperations"]) {
    await db.collection(name).deleteMany({ $or: [{ orderId: { $in: orders } }, { "metadata.orderId": { $in: orders.map(String) } }] }).catch(() => undefined);
  }
  for (const name of ["storecreditaccounts", "storecredittransactions"]) {
    await db.collection(name).deleteMany({ customerId: { $in: created.users } }).catch(() => undefined);
  }
  await db.collection("audit_logs").deleteMany({ $or: [{ resourceName: byTag }, { resourceId: { $in: orders.map(String) } }] }).catch(() => undefined);
  // Shopper notifications store the user id as a string.
  await db.collection("notifications").deleteMany({
    $or: [{ message: byTag }, { title: byTag }, { userId: { $in: [...created.users, ...created.users.map(String)] } }],
  }).catch(() => undefined);
  await db.collection("emailjobs").deleteMany({ $or: [{ subject: byTag }, { to: byTag }] }).catch(() => undefined);
  await User.collection.deleteMany({ _id: { $in: created.users } });
  await Order.collection.deleteMany({ _id: { $in: orders } });
  await EsimProductLink.deleteMany({ _id: { $in: created.links } });
  await EsimPlan.deleteMany({ _id: { $in: created.plans } });
  await EsimProviderLog.deleteMany({ provider: { $in: created.providers } });
  await EsimProvider.deleteMany({ _id: { $in: created.providers } });
}

main()
  .catch((error) => {
    console.error("FAILED:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup().catch((error) => console.error("cleanup failed:", error));
    await disconnectDB();
  });
