/**
 * End-to-end check of eSIM top-ups (TOP-01..07) against a development
 * database, with fake suppliers — nothing is bought for real.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-topup.ts
 *
 * Gives a test shopper three issued eSIMs on fake suppliers (one completes
 * top-ups at once, one answers "processing" first, one refuses), then:
 * eligibility, the priced offers, a quote, the cart line, checkout pricing
 * and its refusals, the cart fingerprint, paid orders carried out (stacked,
 * add-on after a poll, refused → store credit) and the admin list. Removes
 * everything it created — the top-up product too, if it made it — and
 * reports any collection whose document count changed. Refuses to run with
 * NODE_ENV=production.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { Cart, Order, Product, User } from "@/models";
import { EsimFxRate } from "@/models/esim-fx-rate.model";
import { EsimPackage } from "@/models/esim-package.model";
import { EsimPlan } from "@/models/esim-plan.model";
import { getEsimSettings } from "@/models/esim-pricing.model";
import { EsimProfile } from "@/models/esim-profile.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { EsimProviderLog } from "@/models/esim-provider-log.model";
import { EsimTopup } from "@/models/esim-topup.model";
import { EsimTopupQuote } from "@/models/esim-topup-quote.model";
import type { LifecycleStatus } from "@/lib/esim/providers/types";

const tag = `e2e-topup-${Date.now()}`;
type Id = mongoose.Types.ObjectId;
const { ObjectId } = mongoose.Types;
const created = {
  providers: [] as Id[],
  plans: [] as Id[],
  profiles: [] as Id[],
  orders: [] as Id[],
  users: [] as Id[],
  product: null as Id | null,
  fxRate: null as Id | null,
  settingsTopupProduct: undefined as Id | null | undefined,
};

async function counts() {
  const db = mongoose.connection.db!;
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  return new Map(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const)));
}

async function provider(code: string, mode: string) {
  const existing = await EsimProvider.findOne({ code });
  if (existing) return existing;
  const doc = await new EsimProvider({ code, name: code, status: "active", settlementCurrency: "USD", credentials: { mode } }).save();
  created.providers.push(doc._id as Id);
  return doc;
}

async function plan(code: string, mode: string, topup: Record<string, unknown>) {
  const supplier = await provider(code, mode);
  const doc = await new EsimPlan({
    provider: supplier._id,
    providerCode: code,
    providerPlanId: `${tag}-${code}`,
    name: `Japan 5GB 30Days (${code})`,
    slug: `${tag}-${code}`,
    productSlug: `${tag}-japan`,
    destination: `Japan ${tag}`,
    coverage: { scope: "local", countries: [{ code: "JP", name: "Japan" }], networks: [], breakoutIp: [] },
    data: { megabytes: 5120, label: "5GB", type: "total" },
    validityDays: 30,
    duration: { configurable: false, defaultDays: 30, minDays: 30, maxDays: 30 },
    activation: { billingStarts: "first_connection", preInstallDays: 180 },
    topup: { supported: true, type: "test", ...topup },
    cost: { currency: "USD", amountMinor: 300, billingUnit: "plan" },
    syncedAt: new Date(),
    contentHash: tag,
    status: "active",
    available: true,
    retailPriceMinor: 699,
  }).save();
  created.plans.push(doc._id as Id);
  return doc;
}

/** Refused with this reason — in the message, or (a checkout refusal) in the validation error's lines. */
async function refusedWith(run: () => Promise<unknown>, pattern: RegExp) {
  await assert.rejects(run, (error: Error & { errors?: Record<string, string[]> }) => {
    const text = [error.message, ...Object.values(error.errors ?? {}).flat()].join(" ");
    assert.match(text, pattern);
    return true;
  });
}

async function esimOf(owner: Id, planDoc: Awaited<ReturnType<typeof plan>>, n: number, lifecycle: LifecycleStatus = "in_use") {
  const bytes = 5120 * 1024 * 1024;
  const profile = await EsimProfile.create({
    customer: owner,
    email: null,
    order: new ObjectId(),
    orderNumber: `${tag}-esim-${n}`,
    lineIndex: 0,
    unit: 1,
    plan: planDoc._id,
    providerCode: planDoc.providerCode,
    providerOrderId: `fo-${tag}-${n}`,
    providerEsimId: `fake-${tag}-${n}`,
    simId: null,
    iccid: `8999${String(Date.now()).slice(-10)}0000${n}`,
    status: "fulfilled",
    usageAvailable: true,
    lifecycle: { status: lifecycle, profileStatus: "enabled", installed: true },
    installation: { activationCode: null, smdpAddress: null, matchingId: null, qrCodeUrl: null, apn: null },
    fulfilledAt: new Date(),
    expiresAt: new Date(Date.now() + 20 * 86_400_000),
    topupDeadline: new Date(Date.now() + 20 * 86_400_000),
  });
  created.profiles.push(profile._id as Id);
  await EsimPackage.create({ esim: profile._id, plan: planDoc._id, kind: "base", dataTotalBytes: bytes, dataRemainingBytes: bytes / 2, validityDays: 30, status: "active" });
  return profile;
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
    items: [{ vendorId, sku: "ESIM-TOPUP", quantity: 1, ...line }],
    subOrders: [{ _id: new ObjectId(), vendorId, status: "processing", items: [] }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  created.orders.push(insertedId as Id);
  return String(insertedId);
}

async function run() {
  const offersLib = await import("@/lib/esim/topup/offers");
  const { addCartLine } = await import("@/lib/cart/cart-service");
  const { esimLinePrices } = await import("@/lib/esim/cart");
  const { checkoutCartFingerprint } = await import("@/lib/checkout/checkout-cart-fingerprint");
  const fulfilment = await import("@/lib/esim/fulfillment");
  const { listTopupsAdmin } = await import("@/lib/esim/admin/topups");
  const { adminRetryTopup } = await import("@/lib/esim/topup/service");
  const { listEsimTopups } = await import("@/lib/esim/topup/history");

  // Fake top-ups are priced in EUR; give the run a rate if the database has none.
  if (!(await EsimFxRate.exists({ currency: "EUR" }))) {
    const rate = await EsimFxRate.create({ currency: "EUR", usdPerUnit: 1.08, source: "manual", effectiveAt: new Date() });
    created.fxRate = rate._id as Id;
  }
  created.settingsTopupProduct = (await getEsimSettings()).topupProductId ?? null;
  const hadProduct = await Product.exists({ productType: "esim-topup" });

  const alice = await shopper(1);
  const bob = await shopper(2);
  const stackPlan = await plan("fake-fulfil", "fulfil", { mode: "stack", stackTarget: "data", window: "before_expiry" });
  const addonPlan = await plan("fake-pending", "pending", { mode: "addon", window: "while_profile_exists" });
  const refusingPlan = await plan("fake-reject", "reject", { mode: "stack", stackTarget: "data", window: "before_expiry" });
  const stacked = await esimOf(alice, stackPlan, 1);
  const addon = await esimOf(alice, addonPlan, 2, "expired");
  const refused = await esimOf(alice, refusingPlan, 3);
  const usedUp = await esimOf(alice, stackPlan, 4, "depleted");

  // 1. Eligibility and offers.
  const offers = await offersLib.topupOffers(String(alice), String(stacked._id));
  assert.ok(offers?.eligibility.ok, "a live stacking plan can be topped up");
  assert.equal(offers!.offers.length, 2);
  assert.ok(offers!.offers.every((offer) => offer.priceMinor > 0), "both offers are priced");
  assert.ok(offers!.offers[0].priceMinor < offers!.offers[1].priceMinor, "cheapest first");
  const expired = await offersLib.topupOffers(String(alice), String(addon._id));
  assert.ok(expired?.eligibility.ok, "while_profile_exists: an expired package can still take an add-on");
  const depleted = await offersLib.topupOffers(String(alice), String(usedUp._id));
  assert.deepEqual(depleted?.eligibility, { ok: false, reason: "used_up" });
  assert.equal(await offersLib.topupOffers(String(bob), String(stacked._id)), null, "someone else's eSIM is not found");
  console.log(`✓ offers: two top-ups priced ${offers!.offers.map((offer) => offer.priceMinor).join(" / ")} cents; used-up refused; another account sees nothing`);

  // 2. A quote and the cart line. The top-up product is made by the catalogue publish.
  const { ensureTopupProduct } = await import("@/lib/esim/topup/product");
  await ensureTopupProduct();
  const quote = await offersLib.createTopupQuote(String(alice), String(stacked._id), "fake-topup-1gb");
  assert.ok(quote);
  if (!hadProduct) created.product = new ObjectId(quote.product.productId);
  const topupProduct = await Product.findById(quote.product.productId).lean<{ status: string; publishing?: { onlineStore?: boolean } }>();
  assert.equal(topupProduct?.status, "active");
  assert.equal(topupProduct?.publishing?.onlineStore, false, "the top-up product is not on the online store");
  await assert.rejects(() => offersLib.createTopupQuote(String(alice), String(stacked._id), "no-such-topup"), /no longer offered/);
  const line = { productId: quote.product.productId, variantId: quote.product.variantId, quantity: 1, lineAttributes: { topup: quote.quoteId } };
  await addCartLine({ userId: String(alice) }, line);
  await addCartLine({ userId: String(alice) }, line);
  const cart = await Cart.findOne({ userId: String(alice) }).lean<{ items: Array<Record<string, unknown> & { lineAttributes: Record<string, unknown> }> }>();
  assert.equal(cart?.items.length, 1);
  const stored = cart!.items[0];
  assert.equal(stored.quantity, 1, "a top-up added twice stays one unit");
  assert.equal(stored.price, quote.priceMinor / 100);
  assert.equal(stored.variantName, quote.label);
  assert.deepEqual(stored.lineAttributes, { topup: quote.quoteId, iccid: stacked.iccid, label: quote.label });
  await assert.rejects(() => addCartLine({ sessionId: tag }, line), /Sign in/);
  await assert.rejects(() => addCartLine({ userId: String(bob) }, line), /account that owns/);
  await assert.rejects(() => addCartLine({ userId: String(alice) }, { ...line, lineAttributes: undefined as never }), /Choose the top-up/);
  await assert.rejects(() => addCartLine({ userId: String(alice) }, { ...line, quantity: 2 }), /one at a time/);
  console.log(`✓ cart: one unit at ${quote.priceMinor / 100}, named "${quote.label}"; guest, other account, no quote and two units refused`);

  // 3. Checkout pricing and the fingerprint.
  const items = [{ ...stored }];
  const prices = await esimLinePrices(items, { userId: String(alice) });
  assert.equal(prices.get(items[0]), quote.priceMinor / 100);
  await refusedWith(() => esimLinePrices([{ ...stored }], { userId: String(bob) }), /account that owns/);
  await refusedWith(() => esimLinePrices([{ ...stored, quantity: 2 }], { userId: String(alice) }), /one at a time/);
  await refusedWith(() => esimLinePrices([{ ...stored, lineAttributes: {} }], { userId: String(alice) }), /Choose the top-up/);
  const other = await offersLib.createTopupQuote(String(alice), String(refused._id), "fake-topup-1gb");
  const otherLine = { ...stored, lineAttributes: { topup: other!.quoteId, iccid: refused.iccid, label: other!.label } };
  assert.notEqual(checkoutCartFingerprint([stored]), checkoutCartFingerprint([otherLine]), "another eSIM's top-up at the same price is another cart");
  console.log("✓ checkout: priced from the quote; another account, two units and a missing quote refused; the fingerprint tells eSIMs apart");

  // 4. A paid stacking top-up, done at once.
  const order1 = await paidOrder(alice, { productId: new ObjectId(quote.product.productId), variantId: new ObjectId(quote.product.variantId), name: "eSIM Top-up", price: quote.priceMinor / 100, lineAttributes: stored.lineAttributes });
  assert.equal(await fulfilment.esimQueueOrder(order1), 1);
  assert.equal(await fulfilment.esimQueueOrder(order1), 0, "queueing twice adds nothing");
  await fulfilment.esimFulfilOrder(order1);
  const done = await EsimTopup.findOne({ order: order1 }).lean();
  assert.equal(done?.state, "completed");
  assert.equal(done?.priceMinor, quote.priceMinor);
  const call = await EsimProviderLog.findOne({ "refs.topupId": String(done!._id), operation: "topup" }).lean();
  assert.ok(call?.ok, "the supplier call is logged");
  assert.equal((await Order.findById(order1).lean<{ status: string }>())?.status, "delivered", "an all-top-up order is delivered");
  console.log("✓ stacked top-up: queued once, completed, logged, order delivered");

  // 5. An add-on top-up the supplier answers "processing" first.
  const addonQuote = await offersLib.createTopupQuote(String(alice), String(addon._id), "fake-topup-3gb");
  const order2 = await paidOrder(alice, { productId: new ObjectId(addonQuote!.product.productId), variantId: new ObjectId(addonQuote!.product.variantId), name: "eSIM Top-up", price: addonQuote!.priceMinor / 100, lineAttributes: { topup: addonQuote!.quoteId } });
  await fulfilment.esimQueueOrder(order2);
  await fulfilment.esimFulfilOrder(order2);
  let pending = await EsimTopup.findOne({ order: order2 }).lean();
  assert.equal(pending?.state, "processing");
  assert.ok(pending?.providerTopupId, "the supplier's id is kept for the poll");
  await EsimTopup.updateOne({ _id: pending!._id }, { $set: { nextAttemptAt: new Date(Date.now() - 1000) } });
  await fulfilment.runFulfilmentCron();
  pending = await EsimTopup.findOne({ order: order2 }).lean();
  assert.equal(pending?.state, "completed");
  assert.ok(await EsimPackage.exists({ esim: addon._id, kind: "addon", topup: pending!._id }), "the add-on is a package of its own");
  assert.ok(await EsimProviderLog.exists({ "refs.topupId": String(pending!._id), operation: "topup.query" }), "polled with the query call");
  console.log("✓ add-on top-up: processing, polled by the cron, completed, its own package");

  // 6. A refused top-up: failed, refunded to store credit, retry refused once refunded.
  const refusedQuote = await offersLib.createTopupQuote(String(alice), String(refused._id), "fake-topup-1gb");
  const order3 = await paidOrder(alice, { productId: new ObjectId(refusedQuote!.product.productId), variantId: new ObjectId(refusedQuote!.product.variantId), name: "eSIM Top-up", price: refusedQuote!.priceMinor / 100, lineAttributes: { topup: refusedQuote!.quoteId } });
  await fulfilment.esimQueueOrder(order3);
  await fulfilment.esimFulfilOrder(order3);
  const failed = await EsimTopup.findOne({ order: order3 }).lean();
  assert.equal(failed?.state, "failed");
  assert.equal(failed?.refund?.state, "done", `refunded: ${JSON.stringify(failed?.refund)}`);
  assert.equal(failed?.refund?.amount, refusedQuote!.priceMinor / 100);
  await assert.rejects(() => adminRetryTopup(String(failed!._id)), /already refunded/);
  console.log(`✓ refused top-up: failed, ${failed!.refund!.amount} refunded to store credit, no retry after the refund`);

  // 7. A line whose quote belongs to someone else never reaches the supplier.
  const order4 = await paidOrder(bob, { productId: new ObjectId(quote.product.productId), variantId: new ObjectId(quote.product.variantId), name: "eSIM Top-up", price: 1, lineAttributes: { topup: quote.quoteId } });
  await fulfilment.esimQueueOrder(order4);
  await fulfilment.esimFulfilOrder(order4);
  const foreign = await EsimTopup.findOne({ order: order4 }).lean();
  assert.equal(foreign?.state, "failed");
  assert.equal(foreign?.lastError?.code, "invalid");
  assert.equal(await EsimProviderLog.exists({ "refs.topupId": String(foreign!._id) }), null, "no supplier call");
  assert.equal(foreign?.refund?.state, "done", "and the money goes back");
  console.log("✓ someone else's quote: failed without a supplier call, refunded");

  // 8. History and the admin list.
  const history = await listEsimTopups(String(alice), String(stacked._id));
  assert.deepEqual(history.map((row) => row.status), ["completed"]);
  const all = await listTopupsAdmin("all", { search: tag });
  assert.equal(all.rows.length, 4);
  const byProvider = await listTopupsAdmin("all", { search: tag, provider: "fake-reject" });
  assert.equal(byProvider.rows.length, 1);
  const byEmail = await listTopupsAdmin("all", { search: `${tag}-2@esim.test` });
  assert.equal(byEmail.rows.length, 1, "found by the shopper's email");
  const attention = await listTopupsAdmin("attention", { search: tag });
  assert.equal(attention.rows.length, 0, "refunded failures need nobody");
  console.log("✓ history and admin list: by eSIM, supplier, email; nothing left needing a person");
  console.log("All top-up checks passed.");
}

async function cleanup() {
  const db = mongoose.connection.db!;
  const orders = created.orders;
  const byTag = new RegExp(tag);
  const topups = await EsimTopup.find({ order: { $in: orders } }).select({ _id: 1 }).lean();
  await EsimPackage.deleteMany({ esim: { $in: created.profiles } });
  await EsimProfile.deleteMany({ _id: { $in: created.profiles } });
  await EsimTopup.deleteMany({ order: { $in: orders } });
  await EsimTopupQuote.deleteMany({ customer: { $in: created.users } });
  await EsimProviderLog.deleteMany({ $or: [{ provider: { $in: created.providers } }, { "refs.topupId": { $in: topups.map((topup) => String(topup._id)) } }, { "refs.esimId": { $in: created.profiles.map(String) } }] });
  for (const name of ["paymenttransactions", "ledgerentries", "financeoperations"]) {
    await db.collection(name).deleteMany({ $or: [{ orderId: { $in: orders } }, { "metadata.orderId": { $in: orders.map(String) } }] }).catch(() => undefined);
  }
  for (const name of ["storecreditaccounts", "storecredittransactions"]) {
    await db.collection(name).deleteMany({ customerId: { $in: created.users } }).catch(() => undefined);
  }
  await db.collection("audit_logs").deleteMany({ $or: [{ resourceName: byTag }, { resourceId: { $in: orders.map(String) } }] }).catch(() => undefined);
  await db.collection("notifications").deleteMany({
    $or: [{ message: byTag }, { title: byTag }, { userId: { $in: [...created.users, ...created.users.map(String)] } }],
  }).catch(() => undefined);
  await db.collection("emailjobs").deleteMany({ $or: [{ subject: byTag }, { to: byTag }] }).catch(() => undefined);
  await Cart.collection.deleteMany({ $or: [{ userId: { $in: [...created.users, ...created.users.map(String)] } }, { sessionId: tag }] });
  await Order.collection.deleteMany({ _id: { $in: orders } });
  await User.collection.deleteMany({ _id: { $in: created.users } });
  if (created.product) {
    const productId = created.product;
    for (const name of ["audit_logs", "inventorymovements", "inventory_movements", "metacatalogsyncs", "productsearches", "stockmovements"]) {
      await db.collection(name).deleteMany({ $or: [{ productId }, { productId: String(productId) }, { resourceId: String(productId) }, { sourceId: String(productId) }] }).catch(() => undefined);
    }
    await Product.collection.deleteOne({ _id: productId });
  }
  if (created.settingsTopupProduct !== undefined) {
    await db.collection("esimsettings").updateOne({ key: "default" }, created.settingsTopupProduct ? { $set: { topupProductId: created.settingsTopupProduct } } : { $unset: { topupProductId: "" } });
  }
  if (created.fxRate) await EsimFxRate.deleteOne({ _id: created.fxRate });
  await EsimPlan.deleteMany({ _id: { $in: created.plans } });
  await EsimProvider.deleteMany({ _id: { $in: created.providers } });
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
    console.error("FAILED:", error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
