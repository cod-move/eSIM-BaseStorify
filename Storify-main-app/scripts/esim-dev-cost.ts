/**
 * Check of booking eSIM supplier costs in Storify's ledger (ORD-12) against a
 * development database, with the fake supplier — nothing is bought.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-cost.ts
 *
 * An issued eSIM posts "Dr Cost of goods / Cr eSIM supplier balance" at its
 * USD cost, once however often it is posted; cancelling it at the supplier
 * posts the reverse; a cost not known in USD posts nothing. Removes what it
 * made and reports any collection whose count changed, apart from the audit
 * log and notifications. Refuses to run with NODE_ENV=production.
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
const tag = `e2e-cost-${Date.now()}`;
const made = { plans: [] as Id[], links: [] as Id[], orders: [] as Id[] };

async function counts() {
  const db = mongoose.connection.db!;
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  return new Map(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const)));
}

async function run() {
  process.env.ESIM_ENABLE_FAKE_PROVIDER = "true";
  const fulfilment = await import("@/lib/esim/fulfillment");
  const { postEsimCost } = await import("@/lib/esim/finance/cost");
  const { cancelAtSupplier } = await import("@/lib/esim/cancel/service");
  const fake = await EsimProvider.findOne({ code: "fake-fulfil", status: "active" }).lean<{ _id: Id } | null>();
  assert.ok(fake, "the dev database needs the active fake-fulfil supplier (run scripts/esim-dev-seed.ts)");

  const plan = new EsimPlan({
    provider: fake._id,
    providerCode: "fake-fulfil",
    providerPlanId: tag,
    name: "Cost test 1GB",
    slug: tag,
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
    contentHash: tag,
    status: "active",
    retailPriceMinor: 499,
  });
  await plan.save();
  made.plans.push(plan._id as Id);
  const variantId = new ObjectId();
  const link = new EsimProductLink({
    productSlug: tag,
    product: new ObjectId(),
    variants: [{ key: "total|1024|7", variantId, name: "1GB / 7 days", priceMinor: 499, candidates: [plan._id] }],
    publishedAt: new Date(),
  });
  await link.save();
  made.links.push(link._id as Id);

  const vendorId = new ObjectId();
  const { insertedId: orderId } = await Order.collection.insertOne({
    orderNumber: `${tag}-1`,
    customerId: new ObjectId(),
    guestEmail: `${tag}@esim.test`,
    status: "processing",
    paymentStatus: "paid",
    paymentMethod: "stripe",
    channel: "online",
    currency: "USD",
    subtotal: 4.99,
    discount: 0,
    tax: 0,
    shippingCost: 0,
    total: 4.99,
    items: [{ productId: new ObjectId(), variantId, vendorId, name: "Test eSIM", sku: "TEST", price: 4.99, quantity: 1 }],
    subOrders: [{ _id: new ObjectId(), vendorId, status: "processing", items: [] }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  made.orders.push(orderId as Id);

  const costRows = () =>
    LedgerEntry.find({ "source.id": orderId, key: /esim-esim-cost/ }).sort({ createdAt: 1 }).lean<Array<{ debit: string; credit: string; amount: number; currency: string; key: string }>>();

  console.log("1. an issued eSIM draws the supplier balance down at its cost");
  await fulfilment.esimQueueOrder(String(orderId));
  await fulfilment.esimFulfilOrder(String(orderId));
  let rows = await costRows();
  // The fake supplier reports charging 1.00 USD for the eSIM.
  assert.deepEqual(rows.map((row) => [row.debit, row.credit, row.amount, row.currency]), [["cost_of_goods", "esim_supplier_prepaid", 1, "USD"]]);

  console.log("2. posting again adds nothing; an unknown cost posts nothing");
  const profile = await EsimProfile.findOne({ order: orderId });
  assert.ok(profile);
  const again = await postEsimCost({ orderId: orderId as Id, orderNumber: `${tag}-1`, unitId: profile._id as Id, kind: "esim", costUsdMinor: 100, at: new Date() });
  assert.equal(again, false);
  assert.equal((await costRows()).length, 1);
  assert.equal(await postEsimCost({ orderId: orderId as Id, orderNumber: `${tag}-1`, unitId: new ObjectId(), kind: "topup", costUsdMinor: null, at: new Date() }), false);

  console.log("3. cancelled at the supplier: the cost goes back to the supplier balance");
  const cancelled = await cancelAtSupplier(profile);
  assert.equal(cancelled.cancelled, true);
  rows = await costRows();
  assert.deepEqual(rows.map((row) => [row.debit, row.credit, row.amount]), [["cost_of_goods", "esim_supplier_prepaid", 1], ["esim_supplier_prepaid", "cost_of_goods", 1]]);
  console.log("All cost booking checks passed.");
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
    // Delivery sends mail and an order's status change is audited, on purpose.
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
