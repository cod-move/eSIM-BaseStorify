/**
 * End-to-end check of extension payments (PAY, patch P15) against a
 * development database, with the fake gateway — no money moves.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-payments.ts
 *
 * A shopper checks out a wallet top-up with "extension": Storify's checkout
 * writes an attempt and points at the eSIM payment page; a payment is started
 * with the fake method; a forged notification is refused; a signed "paid"
 * notification turns the attempt into a paid order through Storify's own
 * settlement — once, however often it is replayed; a second payment on the
 * same checkout is recorded as owed back; the payment page then says "paid".
 * Removes everything it created and reports any collection whose document
 * count changed. Refuses to run with NODE_ENV=production.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { Cart, CheckoutAttempt, Order, User } from "@/models";
import { getEsimSettings } from "@/models/esim-pricing.model";
import { EsimPayment, EsimPaymentMethod } from "@/models/esim-payment.model";
import { keepTopupProductAsItWas } from "./lib/esim-topup-product";

const tag = `e2e-pay-${Date.now()}`;
const SECRET = "e2e-fake-secret";
type Id = mongoose.Types.ObjectId;
const created = { users: [] as Id[], orders: [] as Id[], attempts: [] as unknown[], refs: [] as string[] };
let walletBefore: unknown = undefined;
let methodBefore: Record<string, unknown> | null | undefined = undefined;
const startedAt = new Date();
const email = `${tag}@esim.test`;
let counterExisted = true;

async function counts() {
  const db = mongoose.connection.db!;
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  return new Map(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const)));
}

async function run() {
  const { ensureWalletProduct } = await import("@/lib/esim/wallet/product");
  const { addCartLine } = await import("@/lib/cart/cart-service");
  const { prepareCheckout } = await import("@/lib/checkout/prepare-checkout");
  const { startExtensionCheckout } = await import("@/lib/esim/payments/checkout");
  const service = await import("@/lib/esim/payments/service");
  const { updatePaymentMethod, listAdminPayments, markPaymentRefunded } = await import("@/lib/esim/admin/payments");
  const { fakeNoticeBody } = await import("@/lib/esim/payments/plugins/fake");

  // The fake method, switched on (kept as it was afterwards).
  methodBefore = await EsimPaymentMethod.collection.findOne({ code: "fake-pay" });
  await EsimPaymentMethod.deleteOne({ code: "fake-pay" });
  await assert.rejects(updatePaymentMethod("fake-pay", { status: "active" }), /Fill in/, "no switching on without its settings");
  await updatePaymentMethod("fake-pay", { status: "active", credentials: { secret: SECRET } });
  assert.ok((await service.extensionMethodNames("USD")).includes("Test payment"));
  console.log("✓ method: refused until set up; then offered at checkout");

  const settings = await getEsimSettings();
  walletBefore = settings.toObject().wallet;
  settings.wallet = { enabled: true, minMinor: 500, maxMinor: 100_000, feeFixedMinor: 0, feePercent: 0 };
  await settings.save();
  const product = await ensureWalletProduct();

  const { insertedId: shopper } = await User.collection.insertOne({ email, name: "E2E Payer", role: "customer", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
  created.users.push(shopper as Id);
  const userId = String(shopper);
  await addCartLine({ userId }, { productId: product.productId, variantId: product.variantId, quantity: 1, lineAttributes: { wallet: 2500 } });

  // 1. Storify's checkout, "extension".
  const body = {
    paymentMethod: "extension" as const,
    email,
    useStoreCredit: false,
    fulfillmentMethod: "delivery" as const,
    billingAddress: { fullName: "E2E Payer", firstName: "E2E", lastName: "Payer", street: "1 Test Street", city: "London", state: "", postalCode: "N1", country: "GB" },
  };
  const context = { user: { id: userId, email, name: "E2E Payer" }, clientIp: "127.0.0.1", origin: "http://localhost:3000" };
  const draft = await prepareCheckout(body as never, context as never, { mode: "place" });
  const start = await startExtensionCheckout(draft, { pageUrl: (ref) => `http://localhost:3000/esim/pay/${ref}`, request: { clientIp: "127.0.0.1", userAgent: "e2e" } });
  created.attempts.push(start.record.id);
  created.refs.push(start.reference);
  assert.equal(start.record.kind, "attempt");
  assert.match(start.reference, service.CHECKOUT_REF);
  const again = await startExtensionCheckout(await prepareCheckout(body as never, context as never, { mode: "place" }), { pageUrl: (ref) => `http://localhost:3000/esim/pay/${ref}`, request: { clientIp: "127.0.0.1", userAgent: "e2e" } });
  assert.equal(again.reference, start.reference, "the same checkout again reuses its page");
  assert.equal(again.resumed, true);
  let page = await service.paymentPage(start.reference);
  assert.equal(page?.state, "open");
  assert.equal(page?.amountMinor, 2500);
  assert.ok(page?.methods.some((method) => method.code === "fake-pay"));
  assert.equal(await service.paymentPage("ext000000000000000000000000"), null);
  console.log("✓ checkout: an attempt, not an order; the payment page asks for 25.00; a retry reuses it");

  // 2. A payment with the fake method.
  const startContext = { origin: "http://localhost:3000", clientIp: "127.0.0.1", userAgent: "e2e", locale: "en" };
  const first = await service.startPayment(start.reference, "fake-pay", startContext);
  assert.equal(first.pay.kind, "redirect");
  assert.match(first.pay.data, /fake=1/);
  await assert.rejects(service.startPayment(start.reference, "bepusdt", startContext), /not available/);
  assert.equal((await EsimPayment.findOne({ reference: first.reference }).lean())?.state, "pending");
  console.log("✓ payment started (pending); a method that is off is refused");

  // 3. Notifications.
  const forged = { ...fakeNoticeBody({ reference: first.reference, state: "paid", amountMinor: 2500, currency: "USD" }, "wrong-secret") };
  assert.deepEqual(await service.receiveNotice("fake-pay", forged), { accepted: false, text: "rejected" });
  const short = fakeNoticeBody({ reference: first.reference, state: "paid", amountMinor: 100, currency: "USD" }, SECRET);
  assert.equal((await service.receiveNotice("fake-pay", short)).accepted, false, "the wrong amount is not accepted");
  assert.equal(await Order.countDocuments({ checkoutAttemptId: start.record.id }), 0);
  const paid = fakeNoticeBody({ reference: first.reference, state: "paid", amountMinor: 2500, currency: "USD" }, SECRET);
  assert.deepEqual(await service.receiveNotice("fake-pay", paid), { accepted: true, text: "ok" });
  const payment = await EsimPayment.findOne({ reference: first.reference }).lean();
  assert.equal(payment?.state, "paid");
  assert.equal(payment?.settlement?.outcome, "order");
  const order = await Order.findById(payment?.settlement?.orderId).lean<{ _id: Id; orderNumber: string; paymentMethod: string; paymentStatus: string; paymentId: string; total: number; checkoutAttemptId?: unknown }>();
  assert.ok(order, "the order exists");
  created.orders.push(order._id);
  assert.equal(order.paymentMethod, "extension");
  assert.equal(order.paymentStatus, "paid");
  assert.equal(order.paymentId, first.reference);
  assert.equal(order.total, 25);
  assert.equal(String(order.checkoutAttemptId), String(start.record.id));
  console.log(`✓ notifications: forged and short refused; paid → order ${order.orderNumber}, paid by extension`);

  assert.deepEqual(await service.receiveNotice("fake-pay", paid), { accepted: true, text: "ok" });
  assert.equal(await service.settlePayment(String(payment!._id)), "order");
  assert.equal(await Order.countDocuments({ checkoutAttemptId: start.record.id }), 1, "one order, however often");
  page = await service.paymentPage(start.reference);
  assert.equal(page?.state, "paid");
  assert.equal(page?.orderNumber, order.orderNumber);
  await assert.rejects(service.startPayment(start.reference, "fake-pay", startContext), /already paid/);
  console.log("✓ replayed: still one order; the page says paid and refuses another payment");

  // 4. Paid twice: the second is owed back.
  const second = await EsimPayment.create({ reference: `EP${Date.now()}E2E`, checkoutRef: start.reference, attemptId: start.record.id as Id, method: "fake-pay", amountMinor: 2500, currency: "USD", state: "pending", email });
  const twice = fakeNoticeBody({ reference: second.reference, state: "paid", amountMinor: 2500, currency: "USD" }, SECRET);
  assert.equal((await service.receiveNotice("fake-pay", twice)).accepted, true);
  const duplicate = await EsimPayment.findById(second._id).lean();
  assert.equal(duplicate?.settlement?.outcome, "duplicate");
  assert.equal(await Order.countDocuments({ checkoutAttemptId: start.record.id }), 1);
  const owed = await listAdminPayments({ attention: true });
  assert.ok(owed.some((row) => row.reference === second.reference && row.needsRefund));
  assert.ok(!owed.some((row) => row.reference === first.reference), "the settled one needs nothing");
  await markPaymentRefunded(String(second._id));
  await assert.rejects(markPaymentRefunded(String(second._id)), /already/);
  assert.ok(!(await listAdminPayments({ attention: true })).some((row) => row.reference === second.reference));
  console.log("✓ paid twice: no second order; listed as owed back until marked sent back");

  // 5. The sweep: nothing left to settle here; an expired open checkout closes.
  await CheckoutAttempt.updateOne({ _id: start.record.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  const swept = await service.sweepPayments();
  assert.equal(swept.failed, 0);
  assert.equal((await CheckoutAttempt.findById(start.record.id).lean<{ status: string }>())?.status, "completed", "an attempt that became an order is not expired");
  console.log("✓ sweep: nothing failed; a paid checkout is left alone");
  console.log("All extension payment checks passed.");
}

async function cleanup() {
  const db = mongoose.connection.db!;
  const orders = created.orders;
  const users = [...created.users, ...created.users.map(String)];
  const byTag = new RegExp(tag);
  const payments = await EsimPayment.find({ checkoutRef: { $in: created.refs } }).select("reference").lean();
  const references = payments.map((payment) => payment.reference);
  for (const name of ["storecreditaccounts", "storecredittransactions"]) {
    await db.collection(name).deleteMany({ customerId: { $in: created.users } }).catch(() => undefined);
  }
  for (const name of ["paymenttransactions", "ledgerentries", "financeoperations"]) {
    await db.collection(name).deleteMany({ $or: [{ orderId: { $in: orders } }, { "metadata.orderId": { $in: orders.map(String) } }] }).catch(() => undefined);
  }
  await db.collection("ledgerentries").deleteMany({ "source.id": { $in: [...orders, ...orders.map(String)] } }).catch(() => undefined);
  await db.collection("collectionreceipts").deleteMany({ orderId: { $in: [...orders, ...orders.map(String)] } }).catch(() => undefined);
  await db.collection("notifications").deleteMany({ "data.orderId": { $in: orders.map(String) } }).catch(() => undefined);
  await db.collection("abandonedcheckouts").deleteMany({ email }).catch(() => undefined);
  await db.collection("customerprofiles").deleteMany({ userId: { $in: users } }).catch(() => undefined);
  // The order number counter, when this run made the first order.
  if (!counterExisted) await db.collection("counters").deleteOne({ _id: "online_order:ORD" as never }).catch(() => undefined);
  await db.collection("esimfulfillments").deleteMany({ orderId: { $in: orders } }).catch(() => undefined);
  await db.collection("audit_logs").deleteMany({ $or: [{ resourceName: byTag }, { resourceId: { $in: orders.map(String) } }, { "metadata.orderId": { $in: orders.map(String) } }] }).catch(() => undefined);
  await db.collection("notifications").deleteMany({
    $or: [{ message: byTag }, { title: byTag }, { userId: { $in: users } }, ...references.map((reference) => ({ message: new RegExp(reference) })), { createdAt: { $gte: startedAt }, title: /Test payment/ }],
  }).catch(() => undefined);
  await db.collection("emailjobs").deleteMany({ $or: [{ subject: byTag }, { to: byTag }] }).catch(() => undefined);
  await db.collection("checkoutpaymentevents").deleteMany({ createdAt: { $gte: startedAt } }).catch(() => undefined);
  await EsimPayment.deleteMany({ checkoutRef: { $in: created.refs } });
  await CheckoutAttempt.collection.deleteMany({ "gateway.extensionReference": { $in: created.refs } });
  await Cart.collection.deleteMany({ userId: { $in: users } });
  await Order.collection.deleteMany({ _id: { $in: orders } });
  await db.collection("customers").deleteMany({ $or: [{ email }, { userId: { $in: users } }] }).catch(() => undefined);
  await User.collection.deleteMany({ _id: { $in: created.users } });
  if (methodBefore !== undefined) {
    await EsimPaymentMethod.collection.deleteOne({ code: "fake-pay" });
    if (methodBefore) await EsimPaymentMethod.collection.insertOne(methodBefore);
  }
  if (walletBefore !== undefined) {
    await db.collection("esimsettings").updateOne({ key: "default" }, walletBefore ? { $set: { wallet: walletBefore } } : { $unset: { wallet: "" } });
  }
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against production");
  await connectDB();
  const before = await counts();
  counterExisted = Boolean(await mongoose.connection.db!.collection("counters").findOne({ _id: "online_order:ORD" as never }));
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
