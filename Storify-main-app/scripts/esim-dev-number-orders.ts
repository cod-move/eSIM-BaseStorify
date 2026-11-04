/**
 * End-to-end check of buying a number card (NUM-03..07) against a development
 * database. Nothing is sent to TopConnect: the account pages read the fake
 * gateway through a temporary supplier (an existing real one is left alone).
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-number-orders.ts
 *
 * Two test shoppers, three numbers of the script's own and a data package:
 * the numbers page's list, a guest refused, the cart line and its price (a
 * euro recharge at a set rate), checkout holding the number, the second
 * shopper refused while it is held and served once the hold ran out, paid
 * orders carried out (the number handed over with its recharge and package
 * waiting; a number taken meanwhile → refunded to store credit), and the
 * release of holds nobody paid for; then the buyer's numbers, the number's
 * page (card read, install details, pending recharge), the delivery email and
 * the order page's panel. Removes everything it created — the
 * number product too, if it made it — and reports any collection whose
 * document count changed. Refuses to run with NODE_ENV=production.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { Cart, Order, Product, User } from "@/models";
import { EsimFxRate } from "@/models/esim-fx-rate.model";
import { EsimNumber } from "@/models/esim-number.model";
import { EsimNumberOrder } from "@/models/esim-number-order.model";
import { EsimNumberOp } from "@/models/esim-number-op.model";
import { EsimNumberPackage } from "@/models/esim-number-package.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { EsimProviderLog } from "@/models/esim-provider-log.model";
import { getEsimSettings } from "@/models/esim-pricing.model";

const tag = `e2e-numbers-${Date.now()}`;
type Id = mongoose.Types.ObjectId;
const { ObjectId } = mongoose.Types;
const created = {
  numbers: [] as Id[],
  packages: [] as Id[],
  orders: [] as Id[],
  users: [] as Id[],
  product: null as Id | null,
  fxRate: null as Id | null,
  provider: null as Id | null,
  settingsNumberProduct: undefined as Id | null | undefined,
};

async function counts() {
  const db = mongoose.connection.db!;
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  return new Map(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const)));
}

async function shopper(n: number) {
  const { insertedId } = await User.collection.insertOne({
    email: `${tag}-${n}@esim.test`,
    name: `E2E Shopper ${n}`,
    role: "customer",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  created.users.push(insertedId as Id);
  return insertedId as Id;
}

async function stockNumber(n: number, premiumMinor = 0) {
  const doc = await EsimNumber.create({
    msisdn: `3725559${String(n).padStart(4, "0")}`,
    dialCode: "372",
    nationalNumber: `5559${String(n).padStart(4, "0")}`,
    country: "EE",
    iccid: `89372999000000${String(n).padStart(5, "0")}`,
    install: { lpa: `LPA:1$rsp.fake.invalid$${tag}-${n}`, pin1: "1234", puk1: "12345678" },
    priceMinor: 1500,
    premiumMinor,
    batch: tag,
  });
  created.numbers.push(doc._id as Id);
  return String(doc._id);
}

async function paidOrder(customerId: Id, line: Record<string, unknown> & { price: number }) {
  const vendorId = new ObjectId();
  const { insertedId } = await Order.collection.insertOne({
    orderNumber: `${tag}-${created.orders.length + 1}`,
    customerId,
    status: "processing",
    paymentStatus: "paid",
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
  const { ensureNumberProduct, findNumberProduct } = await import("@/lib/esim/numbers/product");
  const { esimCartLine, esimLinePrices } = await import("@/lib/esim/cart");
  const { numberShop } = await import("@/lib/esim/numbers/storefront");
  const { releaseExpiredReservations } = await import("@/lib/esim/numbers/cart-line");
  const { esimQueueOrder, esimFulfilOrder } = await import("@/lib/esim/fulfillment");

  const settings = await getEsimSettings();
  created.settingsNumberProduct = settings.numberProductId ?? null;
  const existing = await findNumberProduct();
  const product = await ensureNumberProduct();
  if (!existing) created.product = new ObjectId(product.productId);

  // €1 = $1.20 for this run (the newest manual rate wins); the recharge adds the FX buffer only.
  created.fxRate = (await EsimFxRate.create({ currency: "EUR", usdPerUnit: 1.2, source: "manual", effectiveAt: new Date() }))._id as Id;
  const buffer = settings.fxBufferPercent;
  const packet = await EsimNumberPackage.create({
    packetId: "990001", name: `${tag} EU 5GB`, validityDays: 7, volumeMb: 5000,
    cost: { amountMinor: 800, currency: "EUR" }, retailPriceMinor: 1299, retailPriceManual: true, status: "active",
  });
  created.packages.push(packet._id as Id);

  const alice = await shopper(1);
  const bob = await shopper(2);
  const first = await stockNumber(1);
  const second = await stockNumber(2, 2000);
  const third = await stockNumber(3);

  // The numbers page: anyone can browse, filtered by code, digits and premium.
  const listed = await numberShop({ dialCode: "372", digits: "5559000" });
  assert.deepEqual(listed.rows.map((row) => row.id).sort(), [first, second, third].sort());
  assert.deepEqual((await numberShop({ dialCode: "372", digits: "5559000", premium: "premium" })).rows.map((row) => row.id), [second]);
  assert.ok(listed.packets.some((entry) => entry.id === String(packet._id)));
  assert.equal(listed.recharge.currency, "EUR");
  assert.equal(listed.product?.variantId, product.variantId);
  assert.equal("install" in (listed.rows[0] as object), false, "the page never reads install details");

  const line = (id: string, extra: Record<string, unknown> = {}) => ({
    productId: product.productId,
    variantId: product.variantId,
    quantity: 1,
    lineAttributes: { number: { id, ...extra } },
  });

  await assert.rejects(esimCartLine(line(first), {}), /Sign in/);
  await assert.rejects(esimCartLine(line(first, { recharge: 200 }), { userId: String(alice) }), /between 3 and 300/);
  const added = await esimCartLine(line(first, { recharge: 1000, packet: String(packet._id) }), { userId: String(alice) });
  const rechargeUsd = Math.ceil(1000 * 1.2 * (1 + buffer / 100) - 1e-9);
  assert.ok(added);
  assert.equal(added.singleUnit, true);
  assert.equal(Math.round(added.price! * 100), 1500 + rechargeUsd + 1299);
  assert.equal(added.variantName, `+372 55590001 · €10 credit · ${tag} EU 5GB`);
  assert.equal((await EsimNumber.findById(first).lean())!.status, "available", "the cart does not hold the number");

  // Checkout (NUM-04): the number is held for the shopper who started paying.
  const cartItem = { ...line(first, { recharge: 1000, packet: String(packet._id) }), price: added.price };
  const prices = await esimLinePrices([cartItem], { userId: String(alice) });
  assert.equal(Math.round(prices.get(cartItem)! * 100), 1500 + rechargeUsd + 1299);
  const held = await EsimNumber.findById(first).lean();
  assert.equal(held!.status, "reserved");
  assert.equal(String(held!.reservation!.customer), String(alice));
  const snapshot = (cartItem.lineAttributes as { number: Record<string, unknown> }).number;
  assert.equal(snapshot.rechargeUsdMinor, rechargeUsd);
  assert.equal(snapshot.packetId, "990001");

  await assert.rejects(esimLinePrices([{ ...line(first) }], { userId: String(bob) }), (error: unknown) => /just been taken/.test(JSON.stringify(error)));
  await esimLinePrices([{ ...line(first) }], { userId: String(alice) });
  // A hold that ran out is anyone's.
  await EsimNumber.updateOne({ _id: second }, { $set: { status: "reserved", reservation: { customer: bob, until: new Date(Date.now() - 1000) } } });
  await esimLinePrices([{ ...line(second) }], { userId: String(alice) });
  assert.equal(String((await EsimNumber.findById(second).lean())!.reservation!.customer), String(alice));

  // Paid: alice's number is hers, with its recharge and package waiting to be made.
  const order1 = await paidOrder(alice, { productId: new ObjectId(product.productId), variantId: new ObjectId(product.variantId), name: "Phone number", price: prices.get(cartItem)!, lineAttributes: cartItem.lineAttributes });
  assert.equal(await esimQueueOrder(order1), 1);
  assert.equal(await esimQueueOrder(order1), 0, "queued once");
  await esimFulfilOrder(order1);
  const sold = await EsimNumber.findById(first).lean();
  assert.deepEqual([sold!.status, String(sold!.customer), String(sold!.order), sold!.reservation], ["sold", String(alice), order1, null]);
  const job1 = await EsimNumberOrder.findOne({ order: order1 }).lean();
  assert.deepEqual([job1!.state, job1!.recharge, job1!.packet], ["fulfilled", "pending", "pending"]);
  assert.equal(job1!.line!.recharge, 1000);
  // Its first recharge and package are still to be made (no TopConnect supplier yet here): the number is emailed, the order waits.
  assert.ok((await EsimNumberOrder.findOne({ order: order1 }).lean())!.deliveredAt, "emailed without waiting for the recharge");
  assert.equal((await Order.findById(order1).lean<{ status: string }>())!.status, "processing");

  // Bob holds the third number; alice's payment for it arrives: it is not hers → refunded to her balance.
  await esimLinePrices([{ ...line(third) }], { userId: String(bob) });
  const thirdLine = { number: { ...snapshot, id: third, msisdn: "37255590003", recharge: 0, rechargeUsdMinor: 0, packet: undefined, packetId: undefined, packetUsdMinor: 0 }, label: "+372 55590003" };
  const order2 = await paidOrder(alice, { productId: new ObjectId(product.productId), variantId: new ObjectId(product.variantId), name: "Phone number", price: 15, lineAttributes: thirdLine });
  await esimQueueOrder(order2);
  await esimFulfilOrder(order2);
  const job2 = await EsimNumberOrder.findOne({ order: order2 }).lean();
  assert.equal(job2!.state, "failed");
  assert.equal(job2!.refund?.state, "done");
  assert.equal(job2!.refund?.amount, 15);
  assert.equal(String((await EsimNumber.findById(third).lean())!.reservation!.customer), String(bob), "bob keeps his hold");

  // Holds nobody paid for go back on sale; a sold number never does.
  await EsimNumber.updateMany({ _id: { $in: [second, third] } }, { $set: { "reservation.until": new Date(Date.now() - 1000) } });
  assert.ok((await releaseExpiredReservations()) >= 2);
  assert.deepEqual((await EsimNumber.find({ _id: { $in: [first, second, third] } }).sort({ msisdn: 1 }).lean()).map((row) => row.status), ["sold", "available", "available"]);
  // NUM-06/07: the buyer's numbers and the number's page; never another shopper's.
  const { listCustomerNumbers, getCustomerNumber } = await import("@/lib/esim/numbers/account");
  const { orderEsimUnits } = await import("@/lib/esim/orders/order-panel");
  assert.deepEqual((await listCustomerNumbers(String(alice))).map((row) => row.id), [first]);
  assert.equal(await getCustomerNumber(String(bob), first), null);
  const existingProvider = await EsimProvider.findOne({ code: "topconnect" }).lean();
  const fakeGateway = !existingProvider || (existingProvider.credentials as unknown as Record<string, string> | undefined)?.baseUrl === "fake://topconnect";
  if (!existingProvider) {
    created.provider = (await EsimProvider.create({ code: "topconnect", name: "TopConnect (dev check)", status: "active", settlementCurrency: "EUR", credentials: { baseUrl: "fake://topconnect" } }))._id as Id;
  }
  const page = await getCustomerNumber(String(alice), first);
  assert.ok(page);
  assert.equal(page.install.pin1, "1234");
  assert.equal(page.install.smdpAddress, "rsp.fake.invalid");
  assert.deepEqual(page.pending, ["€10 credit", `${tag} EU 5GB`]);
  assert.equal(page.orderNumber, `${tag}-1`);
  if (fakeGateway) {
    assert.equal(page.refreshFailed, false);
    assert.ok(page.card?.checkedAt, "the card was read from the gateway");
  } else {
    console.log("Skipped the card read: a real TopConnect supplier is set up here.");
  }

  const panel = await orderEsimUnits(order1, { shopperId: String(alice) });
  assert.deepEqual(panel?.map((unit) => [unit.kind, unit.outcome, unit.numberId]), [["number", "issued", first]]);
  assert.deepEqual((await orderEsimUnits(order2))?.map((unit) => [unit.kind, unit.outcome]), [["number", "refunded"]]);
  console.log("Number ordering check passed.");
}

async function cleanup() {
  const db = mongoose.connection.db!;
  const orders = created.orders;
  const byTag = new RegExp(tag);
  await EsimNumberOrder.deleteMany({ order: { $in: orders } });
  await EsimNumberOp.deleteMany({ order: { $in: orders } });
  await EsimNumber.deleteMany({ _id: { $in: created.numbers } });
  await EsimNumberPackage.deleteMany({ _id: { $in: created.packages } });
  for (const name of ["paymenttransactions", "ledgerentries", "financeoperations"]) {
    await db.collection(name).deleteMany({ $or: [{ orderId: { $in: orders } }, { "metadata.orderId": { $in: orders.map(String) } }, { "source.id": { $in: orders } }] }).catch(() => undefined);
  }
  for (const name of ["storecreditaccounts", "storecredittransactions", "storecredits"]) {
    await db.collection(name).deleteMany({ customerId: { $in: created.users } }).catch(() => undefined);
  }
  await db.collection("audit_logs").deleteMany({ $or: [{ resourceName: byTag }, { resourceId: { $in: orders.map(String) } }] }).catch(() => undefined);
  await db.collection("notifications").deleteMany({
    $or: [{ message: byTag }, { title: byTag }, { userId: { $in: [...created.users, ...created.users.map(String)] } }],
  }).catch(() => undefined);
  await db.collection("emailjobs").deleteMany({ $or: [{ subject: byTag }, { to: byTag }] }).catch(() => undefined);
  await Cart.collection.deleteMany({ userId: { $in: [...created.users, ...created.users.map(String)] } });
  await Order.collection.deleteMany({ _id: { $in: orders } });
  await User.collection.deleteMany({ _id: { $in: created.users } });
  if (created.product) {
    const productId = created.product;
    for (const name of ["audit_logs", "inventorymovements", "inventory_movements", "metacatalogsyncs", "productsearches", "stockmovements"]) {
      await db.collection(name).deleteMany({ $or: [{ productId }, { productId: String(productId) }, { resourceId: String(productId) }, { sourceId: String(productId) }] }).catch(() => undefined);
    }
    await Product.collection.deleteOne({ _id: productId });
  }
  if (created.settingsNumberProduct !== undefined) {
    await db.collection("esimsettings").updateOne(
      { key: "default" },
      created.settingsNumberProduct ? { $set: { numberProductId: created.settingsNumberProduct } } : { $unset: { numberProductId: "" } },
    );
  }
  if (created.fxRate) await EsimFxRate.deleteOne({ _id: created.fxRate });
  if (created.provider) {
    await EsimProviderLog.deleteMany({ provider: created.provider });
    await EsimProvider.deleteOne({ _id: created.provider });
  }
  await db.collection("emaildeliveries").deleteMany({ $or: [{ subject: byTag }, { dedupeKey: { $in: orders.map((id) => new RegExp(String(id))) } }] }).catch(() => undefined);
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
