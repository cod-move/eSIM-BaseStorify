/**
 * End-to-end check of recharges and data packages on number cards
 * (NUM-05/08/09) against a development database and the fake TopConnect
 * gateway — nothing is sent to TopConnect. Skips itself when a real
 * TopConnect supplier is set up here.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-number-ops.ts
 *
 * A number bought with a first recharge and package; a recharge bought from
 * the number's page after another sender used the account's order ids; one
 * whose answer is lost (applied once, never twice); a package TopConnect
 * refuses (its price moved back, that part refunded to the balance);
 * cancelling a package; and a refunded order taking the number back. Removes
 * everything it made and reports any collection whose count changed.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { Cart, Order, Product, User } from "@/models";
import { EsimFxRate } from "@/models/esim-fx-rate.model";
import { EsimNumber } from "@/models/esim-number.model";
import { EsimNumberOp } from "@/models/esim-number-op.model";
import { EsimNumberOrder } from "@/models/esim-number-order.model";
import { EsimNumberPackage } from "@/models/esim-number-package.model";
import { EsimNumberSequence } from "@/models/esim-number-sequence.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { EsimProviderLog } from "@/models/esim-provider-log.model";
import { getEsimSettings } from "@/models/esim-pricing.model";

const tag = `e2e-number-ops-${Date.now()}`;
type Id = mongoose.Types.ObjectId;
const { ObjectId } = mongoose.Types;
const MSISDN = "37255577001";
const created = {
  numbers: [] as Id[],
  packages: [] as Id[],
  orders: [] as Id[],
  users: [] as Id[],
  products: [] as Id[],
  fxRate: null as Id | null,
  provider: null as Id | null,
  settings: undefined as Record<string, unknown> | undefined,
  sequence: undefined as Record<string, unknown> | null | undefined,
};

async function counts() {
  const db = mongoose.connection.db!;
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  return new Map(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const)));
}

async function paidOrder(customerId: Id, line: Record<string, unknown> & { price: number }, paymentStatus = "paid") {
  const vendorId = new ObjectId();
  const { insertedId } = await Order.collection.insertOne({
    orderNumber: `${tag}-${created.orders.length + 1}`,
    customerId,
    status: "processing",
    paymentStatus,
    paymentMethod: "stripe",
    channel: "online",
    currency: "USD",
    subtotal: line.price,
    discount: 0,
    tax: 0,
    shippingCost: 0,
    total: line.price,
    items: [{ vendorId, sku: "ESIM-NUMBER", quantity: 1, ...line }],
    subOrders: [{ _id: new ObjectId(), vendorId, status: "processing", items: [] }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  created.orders.push(insertedId as Id);
  return String(insertedId);
}

async function run() {
  const existing = await EsimProvider.findOne({ code: "topconnect" }).lean();
  if (existing && (existing.credentials as unknown as Record<string, string> | undefined)?.baseUrl !== "fake://topconnect") {
    console.log("A TopConnect supplier that is not the fake gateway is set up here; not touching it. Skipped.");
    return;
  }
  if (!existing) {
    created.provider = (await EsimProvider.create({ code: "topconnect", name: "TopConnect (dev check)", status: "active", settlementCurrency: "EUR", credentials: { baseUrl: "fake://topconnect" } }))._id as Id;
  }
  const { ensureNumberProduct, ensureNumberTopupProduct } = await import("@/lib/esim/numbers/product");
  const { esimCartLine, esimLinePrices } = await import("@/lib/esim/cart");
  const { esimQueueOrder, esimFulfilOrder } = await import("@/lib/esim/fulfillment");
  const { processNumberOps } = await import("@/lib/esim/numbers/ops");
  const { getCustomerNumber, cancelCustomerPacket } = await import("@/lib/esim/numbers/account");
  const { esimOnOrderRefunded } = await import("@/lib/esim/cancel/service");
  const { sharedFakeTopConnectState } = await import("@/lib/esim/providers/topconnect-fake");
  const fake = sharedFakeTopConnectState();

  const settings = await getEsimSettings();
  created.settings = { numberProductId: settings.numberProductId ?? null, numberTopupProductId: settings.numberTopupProductId ?? null };
  const productsBefore = new Set([String(settings.numberProductId ?? ""), String(settings.numberTopupProductId ?? "")]);
  const product = await ensureNumberProduct();
  const topupProduct = await ensureNumberTopupProduct();
  for (const ref of [product, topupProduct]) if (!productsBefore.has(ref.productId)) created.products.push(new ObjectId(ref.productId));
  created.sequence = await EsimNumberSequence.findById("topconnect").lean<Record<string, unknown> | null>();
  await EsimNumberSequence.deleteOne({ _id: "topconnect" });
  created.fxRate = (await EsimFxRate.create({ currency: "EUR", usdPerUnit: 1.2, source: "manual", effectiveAt: new Date() }))._id as Id;

  // The fake's packets: "1" costs €5, "9" is always refused.
  const packet1 = await EsimNumberPackage.create({ packetId: "1", name: `${tag} 1 GB`, validityDays: 7, volumeMb: 1000, cost: { amountMinor: 500, currency: "EUR" }, retailPriceMinor: 799, retailPriceManual: true, status: "active" });
  const packet9 = await EsimNumberPackage.create({ packetId: "9", name: `${tag} refused`, validityDays: 1, volumeMb: 1, cost: { amountMinor: 100, currency: "EUR" }, retailPriceMinor: 199, retailPriceManual: true, status: "active" });
  created.packages.push(packet1._id as Id, packet9._id as Id);
  const alice = (await User.collection.insertOne({ email: `${tag}-1@esim.test`, name: "E2E Shopper", role: "customer", emailVerified: true, createdAt: new Date(), updatedAt: new Date() })).insertedId as Id;
  created.users.push(alice);
  const number = await EsimNumber.create({
    msisdn: MSISDN, dialCode: "372", nationalNumber: "55577001", country: "EE", iccid: "8937299900000077001",
    install: { lpa: `LPA:1$rsp.fake.invalid$${tag}` }, priceMinor: 1500, batch: tag,
  });
  created.numbers.push(number._id as Id);
  const id = String(number._id);
  const balance = () => fake.cards.get(MSISDN)?.balanceMinor ?? 0;

  // 1. The number with €10 credit and package "1": both carried out after payment.
  const line = { productId: product.productId, variantId: product.variantId, quantity: 1, lineAttributes: { number: { id, recharge: 1000, packet: String(packet1._id) } } };
  const priced = await esimLinePrices([line], { userId: String(alice) });
  const order1 = await paidOrder(alice, { productId: new ObjectId(product.productId), variantId: new ObjectId(product.variantId), name: "Phone number", price: priced.get(line)!, lineAttributes: line.lineAttributes });
  await esimQueueOrder(order1);
  await esimFulfilOrder(order1);
  const ops1 = await EsimNumberOp.find({ order: order1 }).sort({ kind: -1 }).lean();
  assert.deepEqual(ops1.map((op) => [op.kind, op.state]), [["recharge", "completed"], ["packet", "completed"]]);
  assert.equal(balance(), 1000, "€10 credit, and the package paid by the €5 moved onto the card");
  assert.equal(fake.cards.get(MSISDN)?.packages.length, 1);
  assert.equal((await EsimNumberSequence.findById("topconnect").lean())?.last, fake.lastOrderId, "the store's counter follows the account");
  const job = await EsimNumberOrder.findOne({ order: order1 }).lean();
  assert.deepEqual([job?.recharge, job?.packet], ["done", "done"]);
  assert.equal((await Order.findById(order1).lean<{ status: string }>())?.status, "delivered");

  // 2. Another sender used five ids meanwhile: a €5 recharge bought from the number's page still goes through once.
  fake.lastOrderId += 5;
  const topup = async (choice: Record<string, unknown>) => {
    const item = { productId: topupProduct.productId, variantId: topupProduct.variantId, quantity: 1, lineAttributes: { numberTopup: { number: id, ...choice } } };
    const added = await esimCartLine(item, { userId: String(alice) });
    assert.ok(added?.singleUnit);
    const prices = await esimLinePrices([item], { userId: String(alice) });
    return paidOrder(alice, { productId: new ObjectId(topupProduct.productId), variantId: new ObjectId(topupProduct.variantId), name: "Number top-up", price: prices.get(item)!, lineAttributes: item.lineAttributes });
  };
  await assert.rejects(esimCartLine({ variantId: topupProduct.variantId, quantity: 1, lineAttributes: { numberTopup: { number: id, recharge: 500 } } }, { userId: String(new ObjectId()) }), /owns the number/);
  const order2 = await topup({ recharge: 500 });
  await esimQueueOrder(order2);
  await esimFulfilOrder(order2);
  assert.equal((await EsimNumberOp.findOne({ order: order2 }).lean())?.state, "completed");
  assert.equal(balance(), 1500);

  // 3. The answer to a €3 recharge is lost: it waits, then the card's log shows it went through — never sent twice.
  fake.loseAnswers = 1;
  const order3 = await topup({ recharge: 300 });
  await esimQueueOrder(order3);
  await esimFulfilOrder(order3);
  assert.equal((await EsimNumberOp.findOne({ order: order3 }).lean())?.state, "processing");
  assert.equal(balance(), 1800, "applied once");
  await EsimNumberOp.updateOne({ order: order3 }, { $set: { nextAttemptAt: new Date(0) } });
  await processNumberOps({ orderId: order3 });
  assert.equal((await EsimNumberOp.findOne({ order: order3 }).lean())?.state, "completed");
  assert.equal(balance(), 1800, "still once");

  // 4. Package "9" is refused after its price was moved: moved back, and that part refunded to the balance.
  const order4 = await topup({ packet: String(packet9._id) });
  await esimQueueOrder(order4);
  await esimFulfilOrder(order4);
  const refused = await EsimNumberOp.findOne({ order: order4 }).lean();
  assert.equal(refused?.state, "failed");
  assert.equal(refused?.rollback?.done, true);
  assert.equal(refused?.refund?.state, "done");
  assert.equal(refused?.refund?.amount, 1.99);
  assert.equal(balance(), 1800, "the package price went back");

  // 5. The number's page lists the package with its code; cancelling it stops that one package.
  const page = await getCustomerNumber(String(alice), id);
  assert.deepEqual(page?.pending, []);
  assert.equal(page?.card?.balanceMinor, 1800);
  assert.deepEqual(page?.card?.packages.map((entry) => entry.packetId), ["1"]);
  assert.deepEqual(await cancelCustomerPacket(String(alice), id, "1"), { cancelled: true });
  assert.deepEqual((await getCustomerNumber(String(alice), id))?.card?.packages, []);

  // 6. The number's order refunded in full: the number is taken back, off sale.
  await Order.updateOne({ _id: order1 }, { $set: { paymentStatus: "refunded" } });
  await esimOnOrderRefunded({ orderId: order1 });
  const back = await EsimNumber.findById(id).lean();
  assert.deepEqual([back?.status, back?.customer ?? null], ["retired", null]);
  console.log("Number operations check passed.");
}

async function cleanup() {
  const db = mongoose.connection.db!;
  const orders = created.orders;
  const byTag = new RegExp(tag);
  await EsimNumberOp.deleteMany({ order: { $in: orders } });
  await EsimNumberOrder.deleteMany({ order: { $in: orders } });
  await EsimNumber.deleteMany({ _id: { $in: created.numbers } });
  await EsimNumberPackage.deleteMany({ _id: { $in: created.packages } });
  for (const name of ["paymenttransactions", "ledgerentries", "financeoperations"]) {
    await db.collection(name).deleteMany({ $or: [{ orderId: { $in: orders } }, { "metadata.orderId": { $in: orders.map(String) } }, { "source.id": { $in: orders } }] }).catch(() => undefined);
  }
  for (const name of ["storecreditaccounts", "storecredittransactions", "storecredits"]) {
    await db.collection(name).deleteMany({ customerId: { $in: created.users } }).catch(() => undefined);
  }
  await db.collection("audit_logs").deleteMany({ $or: [{ resourceName: byTag }, { resourceId: { $in: orders.map(String) } }] }).catch(() => undefined);
  await db.collection("notifications").deleteMany({ $or: [{ message: byTag }, { title: byTag }, { userId: { $in: [...created.users, ...created.users.map(String)] } }] }).catch(() => undefined);
  await db.collection("emaildeliveries").deleteMany({ $or: [{ subject: byTag }, { dedupeKey: { $in: orders.map((order) => new RegExp(String(order))) } }] }).catch(() => undefined);
  await db.collection("emailjobs").deleteMany({ $or: [{ subject: byTag }, { to: byTag }] }).catch(() => undefined);
  await Cart.collection.deleteMany({ userId: { $in: [...created.users, ...created.users.map(String)] } });
  await Order.collection.deleteMany({ _id: { $in: orders } });
  await User.collection.deleteMany({ _id: { $in: created.users } });
  for (const productId of created.products) {
    for (const name of ["audit_logs", "inventorymovements", "inventory_movements", "metacatalogsyncs", "productsearches", "stockmovements"]) {
      await db.collection(name).deleteMany({ $or: [{ productId }, { productId: String(productId) }, { resourceId: String(productId) }, { sourceId: String(productId) }] }).catch(() => undefined);
    }
    await Product.collection.deleteOne({ _id: productId });
  }
  if (created.settings) {
    const set = Object.fromEntries(Object.entries(created.settings).filter(([, value]) => value));
    const unset = Object.fromEntries(Object.entries(created.settings).filter(([, value]) => !value).map(([key]) => [key, ""]));
    await db.collection("esimsettings").updateOne({ key: "default" }, { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) });
  }
  if (created.sequence !== undefined) {
    await EsimNumberSequence.deleteOne({ _id: "topconnect" });
    if (created.sequence) await EsimNumberSequence.collection.insertOne(created.sequence as never);
  }
  if (created.fxRate) await EsimFxRate.deleteOne({ _id: created.fxRate });
  if (created.provider) {
    await EsimProviderLog.deleteMany({ provider: created.provider });
    await EsimProvider.deleteOne({ _id: created.provider });
  }
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
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
