/**
 * End-to-end check of day-priced eSIM plans (patch point P10) against a
 * development database, with a fake supplier — nothing is bought for real.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-days.ts
 *
 * Publishes a fake day-priced plan as a Storify product, adds it to a guest
 * cart with chosen days, re-prices it as checkout does, writes a paid order
 * and fulfils it, checking the days at every step. Then removes everything it
 * created and reports any collection whose document count changed. Refuses
 * to run with NODE_ENV=production.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { Cart, Order, Product } from "@/models";
import { EsimFulfillment } from "@/models/esim-fulfillment.model";
import { EsimPackage } from "@/models/esim-package.model";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProductLink } from "@/models/esim-product-link.model";
import { EsimProfile } from "@/models/esim-profile.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { EsimProviderLog } from "@/models/esim-provider-log.model";
import { keepTopupProductAsItWas } from "./lib/esim-topup-product";

const tag = `e2e-days-${Date.now()}`;
const slug = `${tag}-japan`;
type Id = mongoose.Types.ObjectId;
const created = { provider: null as Id | null, plan: null as Id | null, product: null as Id | null, orders: [] as Id[] };
const identity = { sessionId: tag };

async function counts() {
  const db = mongoose.connection.db!;
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  return new Map(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const)));
}

async function refused(run: () => Promise<unknown>, pattern: RegExp) {
  await assert.rejects(run, (error: Error) => pattern.test(error.message));
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against production");
  process.env.ESIM_ENABLE_FAKE_PROVIDER = "true";
  await connectDB();
  const before = await counts();
  const restoreTopupProduct = await keepTopupProductAsItWas();
  try {
    await run();
  } finally {
    await cleanup().catch((error) => console.error("cleanup failed:", error));
    await restoreTopupProduct().catch((error) => console.error("top-up product cleanup failed:", error));
    const after = await counts();
    const changed = [...new Set([...before.keys(), ...after.keys()])]
      .filter((name) => (before.get(name) ?? 0) !== (after.get(name) ?? 0))
      .map((name) => `${name}: ${before.get(name) ?? 0} → ${after.get(name) ?? 0}`);
    console.log(changed.length ? `Collections changed:\n  ${changed.join("\n  ")}` : "Cleanup left every collection as it was.");
  }
}

async function run() {
  const { publishProducts } = await import("@/lib/esim/catalog/publish");
  const { addCartLine, getCartView, setCartLine } = await import("@/lib/cart/cart-service");
  const { esimLinePrices, withLineDays } = await import("@/lib/esim/cart");
  const { orderLineVariantSnapshot } = await import("@/lib/orders/order-line-variant");
  const fulfilment = await import("@/lib/esim/fulfillment");

  // 1. A day-priced plan, published.
  let provider = await EsimProvider.findOne({ code: "fake-fulfil" });
  if (!provider) {
    provider = await new EsimProvider({ code: "fake-fulfil", name: "Fake fulfil", status: "active", settlementCurrency: "USD", credentials: { mode: "fulfil" } }).save();
    created.provider = provider._id as Id;
  }
  const plan = await new EsimPlan({
    provider: provider._id,
    providerCode: "fake-fulfil",
    providerPlanId: tag,
    name: "Japan eSIM Unlimited - 1 day",
    slug: tag,
    productSlug: slug,
    destination: `Japan ${tag}`,
    coverage: { scope: "local", countries: [{ code: "JP", name: "Japan" }], networks: [], breakoutIp: [] },
    data: { megabytes: 0, label: "", type: "unlimited" },
    validityDays: 1,
    duration: { configurable: true, defaultDays: 3, minDays: 1, maxDays: 30 },
    activation: { billingStarts: "first_connection", preInstallDays: 180 },
    topup: { supported: false },
    cost: { currency: "USD", amountMinor: 120, billingUnit: "day" },
    syncedAt: new Date(),
    contentHash: tag,
    status: "active",
    available: true,
    retailPriceMinor: 299,
  }).save();
  created.plan = plan._id as Id;
  const published = await publishProducts({ productSlugs: [slug], status: "active" });
  assert.equal(published.created.length, 1, "the product is created");
  const link = await EsimProductLink.findOne({ productSlug: slug }).lean();
  assert.ok(link);
  created.product = link.product as Id;
  const [variant] = link.variants;
  assert.equal(variant.key, "unlimited|0|perday");
  assert.deepEqual(variant.perDay, { priceMinor: 299, minDays: 1, maxDays: 30, defaultDays: 3 });
  const product = await Product.findById(link.product).lean<{ variants: Array<{ _id: Id; name: string; price: number }> }>();
  assert.equal(product!.variants[0].name, "Unlimited / 1–30 days");
  assert.equal(product!.variants[0].price, 2.99, "the variant sells from its fewest days");
  console.log("✓ published: one variant, 2.99/day, 1–30 days");

  // 2. The cart.
  const line = { productId: String(link.product), variantId: String(variant.variantId) };
  const item = async () => {
    const cart = await Cart.findOne({ sessionId: tag }).lean<{ items: Array<Record<string, unknown>> }>();
    assert.equal(cart?.items.length, 1, "one line per variant");
    return cart!.items[0];
  };
  await addCartLine(identity, { ...line, quantity: 1, lineAttributes: { days: 7 } });
  let stored = await item();
  assert.deepEqual(stored.lineAttributes, { days: 7 });
  assert.equal(stored.price, 20.93);
  assert.equal(stored.variantName, "Unlimited / 7 days");
  await addCartLine(identity, { ...line, quantity: 1, lineAttributes: { days: 7 } });
  assert.equal((await item()).quantity, 2, "the same days again is one more");
  await addCartLine(identity, { ...line, quantity: 1, lineAttributes: { days: 10 } });
  stored = await item();
  assert.equal(stored.quantity, 1, "other days replace the line");
  assert.equal(stored.price, 29.9);
  assert.equal(stored.variantName, "Unlimited / 10 days");
  await refused(() => addCartLine(identity, { ...line, quantity: 1, lineAttributes: { days: 31 } }), /between 1 and 30/);
  await refused(() => addCartLine(identity, { ...line, quantity: 1, lineAttributes: { colour: "red" } }), /Unknown line option/);
  const view = await getCartView(identity);
  assert.equal(view.subtotal, 29.9);
  console.log("✓ cart: 7 days = 20.93, again = qty 2, 10 days replaces (29.90), 31 days and unknown options refused");

  // The app's PUT /cart/lines (setCartLine, upsert): the whole state of the line.
  await setCartLine(identity, { ...line, quantity: 1, lineAttributes: { days: 10 } }, { upsert: true });
  assert.equal((await item()).quantity, 1, "the same state again changes nothing");
  await setCartLine(identity, { ...line, quantity: 1, lineAttributes: { days: 5 } }, { upsert: true });
  stored = await item();
  assert.deepEqual(stored.lineAttributes, { days: 5 }, "other days replace the line");
  assert.equal(stored.price, 14.95);
  await refused(() => setCartLine(identity, { ...line, quantity: 1, lineAttributes: { days: 40 } }, { upsert: true }), /between 1 and 30/);
  await addCartLine(identity, { ...line, quantity: 1, lineAttributes: { days: 10 } });
  stored = await item();
  console.log("✓ app cart: setting the same line again changes nothing; 5 days replaces (14.95); 40 days refused");

  // 3. Checkout re-pricing and the order line's variant.
  const lines: Array<{ variantId?: unknown; lineAttributes?: unknown }> = [
    { ...stored },
    { ...stored, lineAttributes: { days: 99 } },
    { variantId: new mongoose.Types.ObjectId() },
  ];
  const prices = await esimLinePrices(lines);
  assert.equal(prices.get(lines[0]), 29.9);
  assert.equal(prices.get(lines[1]), 89.7, "days beyond the range are charged at its end");
  assert.deepEqual(lines[1].lineAttributes, { days: 30 }, "and the line says so");
  assert.equal(prices.has(lines[2]), false, "other lines are Storify's to price");
  const fullProduct = await Product.findById(link.product).lean();
  const snapshot = withLineDays(stored, orderLineVariantSnapshot(fullProduct as never, String(variant.variantId)));
  assert.equal(snapshot.variantLabel, "Unlimited / 10 days");
  console.log("✓ checkout: re-priced per day, out-of-range days clamped, order line names its days");

  // 4. A paid order, fulfilled for the days bought.
  const vendorId = new mongoose.Types.ObjectId();
  const { insertedId } = await Order.collection.insertOne({
    orderNumber: `${tag}-1`,
    guestEmail: `${tag}@esim.test`,
    status: "processing",
    paymentStatus: "paid",
    currency: "USD",
    subtotal: 29.9,
    total: 29.9,
    items: [{ productId: link.product, variantId: variant.variantId, vendorId, name: "Japan", sku: "DEV", price: 29.9, quantity: 1, lineAttributes: { days: 10 }, ...snapshot }],
    subOrders: [{ _id: new mongoose.Types.ObjectId(), vendorId, status: "processing", items: [] }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  created.orders.push(insertedId);
  assert.equal(await fulfilment.esimQueueOrder(String(insertedId)), 1);
  const job = await EsimFulfillment.findOne({ order: insertedId }).lean();
  assert.equal(job?.durationDays, 10);
  await fulfilment.esimFulfilOrder(String(insertedId));
  const profile = await EsimProfile.findOne({ order: insertedId }).lean();
  assert.equal(profile?.status, "fulfilled");
  assert.equal(profile?.durationDays, 10);
  const pkg = await EsimPackage.findOne({ esim: profile!._id, kind: "base" }).lean();
  assert.equal(pkg?.validityDays, 10);
  const log = await EsimProviderLog.findOne({ "refs.orderId": String(insertedId), operation: "purchase" }).lean<{ request?: { durationDays?: number } }>();
  assert.equal(log?.request?.durationDays, 10, "the supplier is asked for the days");
  console.log("✓ fulfilment: job, purchase, eSIM and package all carry 10 days");
  console.log("All day-priced checks passed.");
}

async function cleanup() {
  const db = mongoose.connection.db!;
  const orders = created.orders;
  const profiles = await EsimProfile.find({ order: { $in: orders } }).select({ _id: 1 }).lean();
  await EsimPackage.deleteMany({ esim: { $in: profiles.map((profile) => profile._id) } });
  await EsimProfile.deleteMany({ order: { $in: orders } });
  await EsimFulfillment.deleteMany({ order: { $in: orders } });
  await EsimProviderLog.deleteMany({ $or: [{ "refs.orderId": { $in: orders.map(String) } }, ...(created.provider ? [{ provider: created.provider }] : [])] });
  await Order.collection.deleteMany({ _id: { $in: orders } });
  await Cart.collection.deleteMany({ sessionId: tag });
  const byTag = new RegExp(tag);
  await db.collection("emailjobs").deleteMany({ $or: [{ subject: byTag }, { to: byTag }] }).catch(() => undefined);
  await db.collection("audit_logs").deleteMany({ $or: [{ resourceName: byTag }, { resourceId: { $in: orders.map(String) } }] }).catch(() => undefined);
  if (created.product) {
    const productId = created.product;
    for (const name of ["audit_logs", "inventorymovements", "inventory_movements", "metacatalogsyncs", "productsearches", "stockmovements"]) {
      await db.collection(name).deleteMany({ $or: [{ productId }, { productId: String(productId) }, { resourceId: String(productId) }, { sourceId: String(productId) }] }).catch(() => undefined);
    }
    await Product.collection.deleteOne({ _id: productId });
  }
  await EsimProductLink.deleteMany({ productSlug: slug });
  await EsimPlan.deleteMany({ productSlug: slug });
  if (created.provider) await EsimProvider.deleteOne({ _id: created.provider });
}

main()
  .catch((error) => {
    console.error("FAILED:", error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
