/**
 * End-to-end check of choosing the day an eSIM starts (ORD-03) against a
 * development database, with the fake supplier — nothing is bought from a
 * real one. The fake schedules activation like BNESIM does.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-activation.ts
 *
 * A fixed-price variant whose suppliers all schedule takes a start date in
 * the cart and keeps Storify's own price; checkout keeps the date and refuses
 * one that has passed; a variant with a supplier that cannot schedule refuses
 * a date; a paid order's job carries the date to the supplier. Removes what
 * it made and reports any collection whose count changed. Refuses to run with
 * NODE_ENV=production.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { Order } from "@/models";
import { EsimFulfillment } from "@/models/esim-fulfillment.model";
import { EsimPackage } from "@/models/esim-package.model";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProductLink } from "@/models/esim-product-link.model";
import { EsimProfile } from "@/models/esim-profile.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { EsimProviderLog } from "@/models/esim-provider-log.model";

const { ObjectId } = mongoose.Types;
type Id = mongoose.Types.ObjectId;
const tag = `e2e-start-${Date.now()}`;
const made = { plans: [] as Id[], links: [] as Id[], orders: [] as Id[] };

async function counts() {
  const db = mongoose.connection.db!;
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  return new Map(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const)));
}

async function plan(providerId: unknown, providerCode: string, suffix: string) {
  const doc = new EsimPlan({
    provider: providerId,
    providerCode,
    providerPlanId: `${tag}-${suffix}`,
    name: `Start test ${suffix}`,
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
    syncedAt: new Date(),
    contentHash: tag,
    status: "active",
    retailPriceMinor: 499,
  });
  await doc.save();
  made.plans.push(doc._id as Id);
  return doc._id as Id;
}

async function link(candidates: Id[]) {
  const variantId = new ObjectId();
  const doc = new EsimProductLink({
    productSlug: `${tag}-${made.links.length + 1}`,
    product: new ObjectId(),
    variants: [{ key: `total|1024|7|${made.links.length}`, variantId, name: "1GB / 7 days", priceMinor: 499, candidates }],
    publishedAt: new Date(),
  });
  await doc.save();
  made.links.push(doc._id as Id);
  return variantId;
}

async function run() {
  process.env.ESIM_ENABLE_FAKE_PROVIDER = "true";
  const { esimCartLine, esimLinePrices } = await import("@/lib/esim/cart");
  const { activationDateBounds } = await import("@/lib/esim/cart/line-attributes");
  const fulfilment = await import("@/lib/esim/fulfillment");

  const fake = await EsimProvider.findOne({ code: "fake-fulfil", status: "active" }).lean<{ _id: Id } | null>();
  assert.ok(fake, "the dev database needs the active fake-fulfil supplier (run scripts/esim-dev-seed.ts)");
  const { min } = activationDateBounds();
  const startOn = new Date(Date.parse(`${min}T00:00:00Z`) + 4 * 86_400_000).toISOString().slice(0, 10);

  console.log("1. the cart takes a start date on a variant whose suppliers schedule, at the variant's own price");
  const dated = await link([await plan(fake._id, "fake-fulfil", "a")]);
  const line = await esimCartLine({ variantId: dated, quantity: 1, lineAttributes: { activateOn: startOn } });
  assert.deepEqual(line?.lineAttributes, { activateOn: startOn });
  assert.equal(line?.price, undefined, "Storify prices it");
  assert.equal(line?.variantName, `1GB / 7 days · starts ${startOn}`);
  assert.equal(await esimCartLine({ variantId: dated, quantity: 1 }), null, "without a date it is an ordinary line");

  console.log("2. refused: a supplier that cannot schedule, a day already gone");
  // A real supplier code that takes no date; never called here.
  const mixed = await link([await plan(fake._id, "fake-fulfil", "b"), await plan(fake._id, "esimaccess", "c")]);
  await assert.rejects(esimCartLine({ variantId: mixed, quantity: 1, lineAttributes: { activateOn: startOn } }), /cannot be given a start date/);
  await assert.rejects(esimCartLine({ variantId: dated, quantity: 1, lineAttributes: { activateOn: "2020-01-01" } }), /Choose a start date between/);

  console.log("3. checkout keeps the date and its price; a date that has passed is refused");
  const item: { variantId: Id; quantity: number; lineAttributes?: unknown } = { variantId: dated, quantity: 1, lineAttributes: { activateOn: startOn, junk: 1 } };
  const prices = await esimLinePrices([item]);
  assert.equal(prices.has(item), false);
  assert.deepEqual(item.lineAttributes, { activateOn: startOn });
  await assert.rejects(esimLinePrices([{ variantId: dated, quantity: 1, lineAttributes: { activateOn: "2020-01-01" } }]), (error: unknown) => {
    assert.ok((error as { errors?: Record<string, string[]> }).errors?.stock?.[0].includes("has passed"));
    return true;
  });

  console.log("4. the paid order's job carries the date to the supplier");
  const vendorId = new ObjectId();
  const { insertedId } = await Order.collection.insertOne({
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
    items: [{ productId: new ObjectId(), variantId: dated, vendorId, name: "Test eSIM", sku: "TEST", price: 4.99, quantity: 1, lineAttributes: { activateOn: startOn } }],
    subOrders: [{ _id: new ObjectId(), vendorId, status: "processing", items: [] }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  made.orders.push(insertedId as Id);
  await fulfilment.esimQueueOrder(String(insertedId));
  assert.equal((await EsimFulfillment.findOne({ order: insertedId }).lean())?.activationDate, startOn);
  await fulfilment.esimFulfilOrder(String(insertedId));
  const job = await EsimFulfillment.findOne({ order: insertedId }).lean();
  assert.equal(job?.state, "fulfilled");
  const log = await EsimProviderLog.findOne({ "refs.orderId": String(insertedId), operation: "purchase" }).lean<{ request?: { activationDate?: string } } | null>();
  assert.equal(log?.request?.activationDate, startOn, "the supplier was asked to start it on that day");
  console.log("All start date checks passed.");
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
