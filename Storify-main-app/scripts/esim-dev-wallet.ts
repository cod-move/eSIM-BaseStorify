/**
 * End-to-end check of wallet top-ups (WAL-01, patches P12 and P19) against a
 * development database — no gateway is charged.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-wallet.ts
 *
 * Sets a fee, puts a top-up in a shopper's cart, prices it as checkout does,
 * books a paid top-up order through Storify's own posting rules (with and
 * without a coupon), checks the refund ceiling, and credits the balance on
 * payment — once. Puts the wallet settings back, removes everything it
 * created and reports any collection whose document count changed. Refuses
 * to run with NODE_ENV=production.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { Cart, Order, User } from "@/models";
import { getEsimSettings } from "@/models/esim-pricing.model";
import { keepTopupProductAsItWas } from "./lib/esim-topup-product";

const tag = `e2e-wallet-${Date.now()}`;
type Id = mongoose.Types.ObjectId;
const { ObjectId } = mongoose.Types;
const created = { users: [] as Id[], orders: [] as Id[] };
let walletBefore: unknown = undefined;

async function counts() {
  const db = mongoose.connection.db!;
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  return new Map(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const)));
}

async function refusedWith(run: () => Promise<unknown>, pattern: RegExp) {
  await assert.rejects(run, (error: Error & { errors?: Record<string, string[]> }) => {
    assert.match([error.message, ...Object.values(error.errors ?? {}).flat()].join(" "), pattern);
    return true;
  });
}

async function run() {
  const { ensureWalletProduct } = await import("@/lib/esim/wallet/product");
  const { addCartLine } = await import("@/lib/cart/cart-service");
  const { esimLinePrices } = await import("@/lib/esim/cart");
  const { orderPaidPostings } = await import("@/lib/finance/postings");
  const { getDefaultVendorIds } = await import("@/lib/finance/post-events");
  const { getOrderRefundCeiling } = await import("@/lib/orders/preorder-cancel-refund");
  const { storeCreditSummary } = await import("@/lib/store-credit/store-credit");
  const fulfilment = await import("@/lib/esim/fulfillment");
  const { LEDGER_ACCOUNT } = await import("@/lib/finance/accounts");

  const settings = await getEsimSettings();
  walletBefore = settings.toObject().wallet;
  settings.wallet = { enabled: true, minMinor: 500, maxMinor: 100_000, feeFixedMinor: 30, feePercent: 0 };
  await settings.save();
  const product = await ensureWalletProduct();

  const { insertedId: shopper } = await User.collection.insertOne({ email: `${tag}@esim.test`, name: "E2E Shopper", role: "customer", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
  created.users.push(shopper as Id);
  const userId = String(shopper);

  // 1. The cart.
  const line = { productId: product.productId, variantId: product.variantId, quantity: 1, lineAttributes: { wallet: 5000 } };
  await addCartLine({ userId }, line);
  await addCartLine({ userId }, line);
  const cart = await Cart.findOne({ userId }).lean<{ items: Array<Record<string, unknown> & { lineAttributes: Record<string, unknown> }> }>();
  assert.equal(cart?.items.length, 1);
  const stored = cart!.items[0];
  assert.equal(stored.quantity, 1, "adding again replaces the line");
  assert.equal(stored.price, 50.3, "50.00 plus a 0.30 fee");
  assert.equal(stored.lineAttributes.wallet, 5000);
  assert.equal(stored.lineAttributes.walletFee, 30);
  await refusedWith(() => addCartLine({ sessionId: tag }, line), /Sign in/);
  await refusedWith(() => addCartLine({ userId }, { ...line, lineAttributes: { wallet: 100 } }), /between 5\.00 and 1000\.00/);
  await refusedWith(() => addCartLine({ userId }, { ...line, lineAttributes: { wallet: 5000, walletFee: 0 } as never, quantity: 2 }), /one amount at a time/);
  console.log("✓ cart: 50.00 + 0.30 fee, one line; guest, out of range and two units refused");

  // 2. Checkout.
  const items = [{ ...stored }];
  assert.equal((await esimLinePrices(items, { userId })).get(items[0]), 50.3);
  await refusedWith(() => esimLinePrices([{ ...stored }, { variantId: new ObjectId(), quantity: 1 }], { userId }), /on its own/);
  console.log("✓ checkout: priced 50.30; refused beside other items");

  // 3. Booking through Storify's own rules (P19).
  const vendorIds = await getDefaultVendorIds();
  const vendorId = new ObjectId([...vendorIds][0]);
  const orderOf = (total: number, discount = 0) => ({
    _id: new ObjectId(),
    orderNumber: `${tag}-${created.orders.length + 1}`,
    customerId: shopper,
    status: "processing",
    paymentStatus: "paid",
    paymentMethod: "stripe",
    channel: "online",
    currency: "USD",
    subtotal: 50.3,
    discount,
    tax: 0,
    shippingCost: 0,
    total,
    items: [{ productId: new ObjectId(product.productId), variantId: new ObjectId(product.variantId), vendorId, name: "Wallet top-up", sku: "WALLET-TOPUP", price: 50.3, quantity: 1, lineAttributes: stored.lineAttributes }],
    subOrders: [{ _id: new ObjectId(), vendorId, status: "processing", paymentStatus: "paid", subtotal: 50.3, items: [{ productId: new ObjectId(product.productId), variantId: new ObjectId(product.variantId), quantity: 1 }] }],
    paidAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const full = orderOf(50.3);
  const entries = orderPaidPostings(full as never, { defaultVendorIds: vendorIds });
  const credited = entries.filter((entry) => entry.credit === LEDGER_ACCOUNT.STORE_CREDIT_PAYABLE);
  const revenue = entries.filter((entry) => entry.credit === LEDGER_ACCOUNT.PRODUCT_REVENUE);
  assert.deepEqual(credited.map((entry) => entry.amount), [50], "the amount is owed to the shopper");
  assert.deepEqual(revenue.map((entry) => entry.amount), [0.3], "only the fee is income");
  const discounted = orderOf(45.27, 5.03);
  const discountedEntries = orderPaidPostings(discounted as never, { defaultVendorIds: vendorIds });
  assert.deepEqual(discountedEntries.filter((entry) => entry.credit === LEDGER_ACCOUNT.STORE_CREDIT_PAYABLE).map((entry) => entry.amount), [45]);
  assert.deepEqual(discountedEntries.filter((entry) => entry.credit === LEDGER_ACCOUNT.PRODUCT_REVENUE).map((entry) => entry.amount), [0.27]);
  assert.equal(getOrderRefundCeiling(full as never), 0.3, "only the fee can be refunded");
  console.log("✓ booking: 50.00 to store credit payable, 0.30 revenue; with a 10% coupon 45.00 and 0.27; refundable: the fee");

  // 4. Paid: the balance, once; the order delivered.
  await Order.collection.insertOne(full);
  created.orders.push(full._id);
  assert.equal(await fulfilment.esimQueueOrder(String(full._id)), 1, "a credit is due");
  await fulfilment.esimFulfilOrder(String(full._id));
  assert.equal((await storeCreditSummary(userId)).find((entry) => entry.currency === "USD")?.balance, 50);
  assert.equal(await fulfilment.esimQueueOrder(String(full._id)), 0, "nothing due any more");
  await fulfilment.esimFulfilOrder(String(full._id));
  await fulfilment.runFulfilmentCron();
  assert.equal((await storeCreditSummary(userId)).find((entry) => entry.currency === "USD")?.balance, 50, "credited once");
  assert.equal((await Order.findById(full._id).lean<{ status: string }>())?.status, "delivered");
  console.log("✓ paid: 50.00 balance, once (settlement, again, and the cron); order delivered");
  console.log("All wallet checks passed.");
}

async function cleanup() {
  const db = mongoose.connection.db!;
  const orders = created.orders;
  const users = [...created.users, ...created.users.map(String)];
  const byTag = new RegExp(tag);
  for (const name of ["storecreditaccounts", "storecredittransactions"]) {
    await db.collection(name).deleteMany({ customerId: { $in: created.users } }).catch(() => undefined);
  }
  for (const name of ["paymenttransactions", "ledgerentries", "financeoperations"]) {
    await db.collection(name).deleteMany({ $or: [{ orderId: { $in: orders } }, { "metadata.orderId": { $in: orders.map(String) } }] }).catch(() => undefined);
  }
  await db.collection("audit_logs").deleteMany({ $or: [{ resourceName: byTag }, { resourceId: { $in: orders.map(String) } }] }).catch(() => undefined);
  await db.collection("notifications").deleteMany({ $or: [{ message: byTag }, { title: byTag }, { userId: { $in: users } }] }).catch(() => undefined);
  await db.collection("emailjobs").deleteMany({ $or: [{ subject: byTag }, { to: byTag }] }).catch(() => undefined);
  await Cart.collection.deleteMany({ $or: [{ userId: { $in: users } }, { sessionId: tag }] });
  await Order.collection.deleteMany({ _id: { $in: orders } });
  await User.collection.deleteMany({ _id: { $in: created.users } });
  if (walletBefore !== undefined) {
    await db.collection("esimsettings").updateOne({ key: "default" }, walletBefore ? { $set: { wallet: walletBefore } } : { $unset: { wallet: "" } });
  }
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against production");
  await connectDB();
  const before = await counts();
  const restoreProducts = await keepTopupProductAsItWas();
  try {
    await run();
  } finally {
    await cleanup().catch((error) => console.error("cleanup failed:", error));
    await restoreProducts().catch((error) => console.error("product cleanup failed:", error));
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
