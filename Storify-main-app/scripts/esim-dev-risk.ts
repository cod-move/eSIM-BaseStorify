/**
 * End-to-end check of checkout's plan check (CAT-09) and order review
 * (ORD-13) against a development database, with the fake supplier — nothing
 * is bought from a real one.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-risk.ts
 *
 * Checkout: a variant whose first plan the supplier withdrew is still sold
 * from the next one (the withdrawn plan is marked unavailable); a variant
 * with no plan left, or only switched-off ones, is refused. Review: a large
 * order is held, nothing bought until approved; a rejected one buys nothing,
 * credits no balance and waits for a refund by hand; a buyer's second order
 * in the window is held. Puts the settings back, removes what it made and
 * reports any collection whose count changed, apart from the admins'
 * notifications and the audit log, which stay. Refuses to run with
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
import { getEsimSettings } from "@/models/esim-pricing.model";

const { ObjectId } = mongoose.Types;
const tag = `e2e-risk-${Date.now()}`;
type Id = mongoose.Types.ObjectId;
/** Rejects with checkout's out-of-stock refusal naming this text. */
const refusal = (text: string) => (error: unknown) => {
  const errors = (error as { errors?: Record<string, string[]> }).errors;
  assert.ok(errors?.stock?.some((message) => message.includes(text)), `expected a refusal naming ${text}: ${JSON.stringify(errors)}`);
  return true;
};
const made = { plans: [] as Id[], links: [] as Id[], orders: [] as Id[], users: [] as Id[] };
let riskBefore: unknown = undefined;

async function counts() {
  const db = mongoose.connection.db!;
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  return new Map(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const)));
}

async function plan(provider: { _id: unknown; code: string }, suffix: string, overrides: Record<string, unknown> = {}) {
  const doc = new EsimPlan({
    provider: provider._id,
    providerCode: provider.code,
    providerPlanId: `${tag}-${suffix}`,
    name: `Risk test ${suffix}`,
    slug: `${tag}-${suffix}`,
    productSlug: tag,
    destination: "Testland",
    coverage: { scope: "local", countries: [{ code: "JP", name: "Japan" }], networks: [], breakoutIp: [] },
    data: { megabytes: 1024, label: "1GB", type: "total" },
    validityDays: 7,
    duration: { configurable: false, defaultDays: 7, minDays: 7, maxDays: 7 },
    activation: { billingStarts: "first_connection", preInstallDays: 180 },
    topup: { supported: false, mode: "none", window: null },
    cost: { currency: "USD", amountMinor: 100, billingUnit: "plan" },
    syncedAt: new Date(),
    contentHash: tag,
    status: "active",
    available: true,
    retailPriceMinor: 199,
    ...overrides,
  });
  await doc.save();
  made.plans.push(doc._id as Id);
  return doc._id as Id;
}

async function link(candidates: Id[], name = "1GB / 7 days") {
  const variantId = new ObjectId();
  const doc = new EsimProductLink({
    productSlug: `${tag}-${made.links.length + 1}`,
    product: new ObjectId(),
    variants: [{ key: `total|1024|7|${made.links.length}`, variantId, name, priceMinor: 199, candidates }],
    publishedAt: new Date(),
  });
  await doc.save();
  made.links.push(doc._id as Id);
  return variantId;
}

async function paidOrder(variantId: Id, price: number, buyer: { customerId?: Id; guestEmail?: string }) {
  const vendorId = new ObjectId();
  const { insertedId } = await Order.collection.insertOne({
    orderNumber: `${tag}-${made.orders.length + 1}`,
    customerId: buyer.customerId ?? new ObjectId(),
    ...(buyer.guestEmail ? { guestEmail: buyer.guestEmail } : {}),
    status: "processing",
    paymentStatus: "paid",
    paymentMethod: "stripe",
    channel: "online",
    currency: "USD",
    subtotal: price,
    discount: 0,
    tax: 0,
    shippingCost: 0,
    total: price,
    items: [{ productId: new ObjectId(), variantId, vendorId, name: "Test eSIM", sku: "TEST", price, quantity: 1 }],
    subOrders: [{ _id: new ObjectId(), vendorId, status: "processing", items: [] }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  made.orders.push(insertedId as Id);
  return String(insertedId);
}

async function run() {
  process.env.ESIM_ENABLE_FAKE_PROVIDER = "true";
  const { esimLinePrices } = await import("@/lib/esim/cart");
  const { forgetPlanChecks } = await import("@/lib/esim/cart/plan-check");
  const fulfilment = await import("@/lib/esim/fulfillment");
  const { adminReviewOrder, adminRetryJob, JobActionError } = await import("@/lib/esim/fulfillment/service");
  const { settleOrderDelivery } = await import("@/lib/esim/fulfillment/delivery");

  const provider = await EsimProvider.findOne({ code: "fake-fulfil", status: "active" }).lean<{ _id: Id; code: string } | null>();
  assert.ok(provider, "the dev database needs the active fake-fulfil supplier (run scripts/esim-dev-seed.ts)");

  console.log("1. checkout asks the supplier about the plans behind the cart (CAT-09)");
  forgetPlanChecks();
  const gonePlan = await plan(provider, "gone-1");
  const okPlan = await plan(provider, "ok-1");
  const failover = await link([gonePlan, okPlan]);
  await esimLinePrices([{ variantId: failover, quantity: 1 }]);
  assert.equal((await EsimPlan.findById(gonePlan).lean())?.available, false, "the withdrawn plan is marked unavailable");
  assert.equal((await EsimPlan.findById(okPlan).lean())?.available, true);

  const onlyGone = await link([await plan(provider, "gone-2")], "Gone plan");
  await assert.rejects(esimLinePrices([{ variantId: onlyGone, quantity: 1 }]), refusal("No longer available: Gone plan"));
  const soldOut = await link([await plan(provider, "soldout-1")], "Sold-out plan");
  await assert.rejects(esimLinePrices([{ variantId: soldOut, quantity: 1 }]), refusal("Sold-out plan"));
  const switchedOff = await link([await plan(provider, "off-1", { status: "disabled" })], "Switched-off plan");
  await assert.rejects(esimLinePrices([{ variantId: switchedOff, quantity: 1 }]), refusal("Switched-off plan"));
  const sellable = await link([await plan(provider, "ok-2")]);
  await esimLinePrices([{ variantId: sellable, quantity: 1 }]);
  console.log("   ok — failover past a withdrawn plan, refusal with none left");

  const settings = await getEsimSettings();
  riskBefore = settings.toObject().risk;

  console.log("2. a large order is held until approved (ORD-13)");
  settings.risk = { reviewOverMinor: 5000, maxOrders: 0, windowHours: 24 };
  await settings.save();
  const small = await paidOrder(sellable, 9.99, { guestEmail: `${tag}-a@esim.test` });
  await fulfilment.esimQueueOrder(small);
  assert.equal((await EsimFulfillment.findOne({ order: small }).lean())?.state, "queued", "below the amount: bought as usual");
  const large = await paidOrder(sellable, 60, { guestEmail: `${tag}-b@esim.test` });
  await fulfilment.esimQueueOrder(large);
  await fulfilment.esimFulfilOrder(large);
  let held = await EsimFulfillment.findOne({ order: large }).lean();
  assert.equal(held?.state, "review");
  assert.equal(held?.attempts, 0, "nothing bought while held");
  assert.match(held?.review?.reasons[0] ?? "", /60\.00/);
  assert.equal(await settleOrderDelivery(large), "running");
  await assert.rejects(adminRetryJob(String(held!._id)), JobActionError, "retry cannot skip the review");
  await adminReviewOrder(String(held!._id), "approved", "e2e");
  await fulfilment.esimFulfilOrder(large);
  held = await EsimFulfillment.findOne({ order: large }).lean();
  assert.equal(held?.state, "fulfilled");
  assert.equal(held?.review?.decision, "approved");
  console.log("   ok — held, approved, issued");

  console.log("3. a rejected order buys nothing and is refunded by hand, not to a balance");
  const { insertedId: shopper } = await User.collection.insertOne({ email: `${tag}@esim.test`, name: "E2E Risk", role: "customer", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
  made.users.push(shopper as Id);
  const rejected = await paidOrder(sellable, 75, { customerId: shopper as Id });
  await fulfilment.esimQueueOrder(rejected);
  const job = await EsimFulfillment.findOne({ order: rejected }).lean();
  await adminReviewOrder(String(job!._id), "rejected", "e2e");
  await settleOrderDelivery(rejected);
  const after = await EsimFulfillment.findOne({ order: rejected }).lean();
  assert.equal(after?.state, "failed");
  assert.equal(after?.attempts, 0);
  assert.equal(after?.refund?.state, "manual");
  assert.equal(after?.refund?.amount, 75);
  assert.equal((await Order.findById(rejected).lean<{ refundedTotal?: number }>())?.refundedTotal ?? 0, 0, "no store credit given");
  await assert.rejects(adminReviewOrder(String(job!._id), "approved"), JobActionError, "decided once");
  console.log("   ok — rejected, 75.00 to refund by hand");

  console.log("4. a buyer's next order inside the window is held");
  settings.risk = { reviewOverMinor: 0, maxOrders: 1, windowHours: 24 };
  await settings.save();
  const buyer = `${tag}-c@esim.test`;
  const first = await paidOrder(sellable, 4.99, { guestEmail: buyer });
  await fulfilment.esimQueueOrder(first);
  assert.equal((await EsimFulfillment.findOne({ order: first }).lean())?.state, "queued");
  const second = await paidOrder(sellable, 4.99, { guestEmail: buyer });
  await fulfilment.esimQueueOrder(second);
  const secondJob = await EsimFulfillment.findOne({ order: second }).lean();
  assert.equal(secondJob?.state, "review");
  assert.match(secondJob?.review?.reasons[0] ?? "", /1 eSIM order/);
  console.log("   ok — second order held");
  console.log("All risk checks passed.");
}

async function cleanup() {
  const settings = await getEsimSettings();
  if (riskBefore !== undefined) {
    settings.set("risk", riskBefore);
    await settings.save();
  }
  const profiles = await EsimProfile.find({ order: { $in: made.orders } }).select({ _id: 1 }).lean();
  await EsimPackage.deleteMany({ esim: { $in: profiles.map((profile) => profile._id) } });
  await EsimProfile.deleteMany({ order: { $in: made.orders } });
  await EsimFulfillment.deleteMany({ order: { $in: made.orders } });
  await EsimProviderLog.deleteMany({ $or: [{ "refs.orderId": { $in: made.orders.map(String) } }, { "refs.planId": { $in: made.plans.map(String) } }] });
  await Order.collection.deleteMany({ _id: { $in: made.orders } });
  await User.collection.deleteMany({ _id: { $in: made.users } });
  await EsimProductLink.deleteMany({ _id: { $in: made.links } });
  await EsimPlan.deleteMany({ _id: { $in: made.plans } });
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against production");
  await connectDB();
  const before = await counts();
  try {
    await run();
  } finally {
    await cleanup();
    // The admins' notices and the orders' audit trail are written on purpose and stay.
    const kept = new Set(["notifications", "audit_logs"]);
    const after = await counts();
    const changed = [...after].filter(([name, count]) => !kept.has(name) && before.get(name) !== count);
    console.log(changed.length ? `Collections changed: ${JSON.stringify(changed)}` : "Cleanup left every collection as it was.");
    await disconnectDB();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
