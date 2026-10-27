/**
 * End-to-end check of referrals (REF-01..06, patch P14) against a
 * development database — no gateway is charged.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-referrals.ts
 *
 * A referrer's code, a friend signing up with the invite cookie (the sign-up
 * hook's own entry point), their welcome coupon, a commission per delivered
 * order, payout after the holding period, a refund before payout (cancelled)
 * and after it (marked to take back), and the referral centre. Puts the
 * referral settings back, removes everything it created and reports any
 * collection whose document count changed. Refuses to run with
 * NODE_ENV=production.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { Order, User } from "@/models";
import { Coupon } from "@/models/coupon.model";
import { getEsimSettings } from "@/models/esim-pricing.model";
import { EsimReferral, EsimReferralCode, EsimReferralCommission } from "@/models/esim-referral.model";

const tag = `e2e-ref-${Date.now()}`;
type Id = mongoose.Types.ObjectId;
const { ObjectId } = mongoose.Types;
const created = { users: [] as Id[], orders: [] as Id[] };
let referralBefore: unknown = undefined;
const DAY = 86_400_000;

async function counts() {
  const db = mongoose.connection.db!;
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  return new Map(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const)));
}

async function user(n: number) {
  const { insertedId } = await User.collection.insertOne({ email: `${tag}-${n}@esim.test`, name: `E2E ${n}`, role: "customer", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
  created.users.push(insertedId as Id);
  return String(insertedId);
}

async function deliveredOrder(customerId: string, total: number, items?: Array<Record<string, unknown>>) {
  const { insertedId } = await Order.collection.insertOne({
    orderNumber: `${tag}-${created.orders.length + 1}`,
    customerId: new ObjectId(customerId),
    status: "delivered",
    paymentStatus: "paid",
    currency: "USD",
    total,
    tax: 0,
    shippingCost: 0,
    items: items ?? [{ productId: new ObjectId(), variantId: new ObjectId(), name: "Japan eSIM", price: total, quantity: 1 }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  created.orders.push(insertedId as Id);
  return String(insertedId);
}

async function run() {
  const service = await import("@/lib/esim/referral/service");
  const { earnReferralCommission, runReferralPayouts } = await import("@/lib/esim/referral/commission");
  const { referralCentre } = await import("@/lib/esim/referral/centre");
  const { listReferralCommissions } = await import("@/lib/esim/admin/referrals");
  const { storeCreditSummary } = await import("@/lib/store-credit/store-credit");

  const settings = await getEsimSettings();
  referralBefore = settings.toObject().referral;
  settings.referral = {
    enabled: true, commissionType: "percent", commissionValue: 10, validityDays: 365, orderLimit: 0, holdDays: 14,
    coupon: { enabled: true, type: "percentage", value: 15, days: 30, minOrderMinor: 0 },
  };
  await settings.save();

  // 1. Codes.
  const alice = await user(1);
  const bob = await user(2);
  const carol = await user(3);
  const generated = await service.ensureReferralCode(alice);
  assert.match(generated, /^[A-Z2-9]{8}$/);
  assert.equal(await service.ensureReferralCode(alice), generated, "asked again: the same code");
  const custom = `T${String(Date.now()).slice(-7)}`;
  assert.equal(await service.setReferralCode(alice, custom.toLowerCase()), custom);
  await assert.rejects(() => service.setReferralCode(carol, custom), /taken/);
  await assert.rejects(() => service.setReferralCode(carol, "no"), /4 to 16/);
  assert.equal(await service.referralCodeExists(custom), true);
  console.log(`✓ codes: generated ${generated}, changed to ${custom}; a taken or short code refused`);

  // 2. Sign-up through the invite cookie (what the P14 hook calls).
  const cookie = (code: string) => new Headers({ cookie: `other=1; ${service.REFERRAL_COOKIE}=${encodeURIComponent(code)}` });
  await service.esimOnUserCreated({ id: bob, role: "customer" }, cookie(custom));
  const referral = await EsimReferral.findOne({ referee: bob }).lean();
  assert.equal(String(referral?.referrer), alice);
  assert.ok(referral?.couponCode, "a welcome coupon was made");
  const coupon = await Coupon.findOne({ code: referral!.couponCode! }).lean<{ restrictedToUserId?: unknown; value: number; usageLimit?: number }>();
  assert.equal(String(coupon?.restrictedToUserId), bob, "for the friend's account only");
  assert.equal(coupon?.value, 15);
  assert.equal(coupon?.usageLimit, 1);
  await service.esimOnUserCreated({ id: bob, role: "customer" }, cookie(custom));
  assert.equal(await EsimReferral.countDocuments({ referee: bob }), 1, "once per account");
  await service.esimOnUserCreated({ id: alice, role: "customer" }, cookie(custom));
  assert.equal(await EsimReferral.exists({ referee: alice }), null, "nobody refers themselves");
  await service.esimOnUserCreated({ id: carol, role: "customer" }, new Headers());
  assert.equal(await EsimReferral.exists({ referee: carol }), null, "no cookie, no referral");
  console.log("✓ sign-up: referral recorded once, welcome coupon (15%, one use, the friend only); self and cookie-less refused");

  // 3. Commission on delivered orders.
  const order1 = await deliveredOrder(bob, 20);
  const commission = await earnReferralCommission(order1);
  assert.equal(commission?.amount, 2);
  assert.equal(await earnReferralCommission(order1), null, "once per order");
  const wallet = await deliveredOrder(bob, 50.3, [{ productId: new ObjectId(), variantId: new ObjectId(), price: 50.3, quantity: 1, lineAttributes: { wallet: 5000, walletFee: 30 } }]);
  assert.equal((await earnReferralCommission(wallet))?.amount ?? 0, 0.03, "a wallet top-up earns on its fee only");
  assert.equal(await earnReferralCommission(await deliveredOrder(carol, 20)), null, "not a referee");
  console.log("✓ commission: 10% of 20.00 = 2.00, once; a wallet top-up earns only on its fee; non-referees earn nothing");

  // 4. Holding period, payout, refunds.
  const order2 = await deliveredOrder(bob, 30);
  await earnReferralCommission(order2);
  await Order.collection.updateOne({ _id: new ObjectId(order2) }, { $set: { refundedTotal: 30, paymentStatus: "refunded" } });
  assert.deepEqual(await runReferralPayouts(), { paid: 0, cancelled: 0, clawbacks: 0 }, "nothing before the holding period ends");
  const later = new Date(Date.now() + 15 * DAY);
  const payout = await runReferralPayouts({ now: later });
  assert.equal(payout.paid, 2, JSON.stringify(payout));
  assert.equal(payout.cancelled, 1, "the order refunded during the hold earns nothing");
  assert.equal((await storeCreditSummary(alice)).find((entry) => entry.currency === "USD")?.balance, 2.03);
  assert.deepEqual(await runReferralPayouts({ now: later }), { paid: 0, cancelled: 0, clawbacks: 0 }, "paid once");
  await Order.collection.updateOne({ _id: new ObjectId(order1) }, { $set: { refundedTotal: 10, paymentStatus: "partially_refunded" } });
  const late = await runReferralPayouts({ now: later });
  assert.equal(late.clawbacks, 1);
  assert.equal((await EsimReferralCommission.findOne({ order: order1 }).lean())?.clawback?.amount, 1, "half refunded after payment: 1.00 to take back");
  assert.equal((await listReferralCommissions("attention", { search: tag })).rows.length, 1);
  console.log("✓ payout: 2.03 after 14 days, once; refunded during the hold cancelled; refunded after it marked for 1.00 back");

  // 5. The referral centre.
  const centre = await referralCentre(alice);
  assert.equal(centre.code, custom);
  assert.ok(centre.link.endsWith(`/esim/invite/${custom}`));
  assert.deepEqual(centre.invited.map((entry) => entry.who), [`${tag.slice(0, 1)}***@esim.test`]);
  assert.equal(centre.totals.paid, 2.03);
  assert.equal(centre.rewards.length, 3);
  console.log("✓ centre: code, link, one friend (email masked), 2.03 received, three rewards listed");
  console.log("All referral checks passed.");
}

async function cleanup() {
  const db = mongoose.connection.db!;
  const users = [...created.users, ...created.users.map(String)];
  const byTag = new RegExp(tag);
  await EsimReferralCommission.deleteMany({ order: { $in: created.orders } });
  await EsimReferral.deleteMany({ $or: [{ referrer: { $in: created.users } }, { referee: { $in: created.users } }] });
  await EsimReferralCode.deleteMany({ user: { $in: created.users } });
  await Coupon.deleteMany({ restrictedToUserId: { $in: created.users } });
  for (const name of ["storecreditaccounts", "storecredittransactions"]) {
    await db.collection(name).deleteMany({ customerId: { $in: created.users } }).catch(() => undefined);
  }
  await db.collection("audit_logs").deleteMany({ $or: [{ resourceName: byTag }, { resourceId: { $in: created.orders.map(String) } }] }).catch(() => undefined);
  await db.collection("notifications").deleteMany({ $or: [{ message: byTag }, { title: byTag }, { userId: { $in: users } }] }).catch(() => undefined);
  await db.collection("emailjobs").deleteMany({ $or: [{ subject: byTag }, { to: byTag }] }).catch(() => undefined);
  await Order.collection.deleteMany({ _id: { $in: created.orders } });
  await User.collection.deleteMany({ _id: { $in: created.users } });
  if (referralBefore !== undefined) {
    await db.collection("esimsettings").updateOne({ key: "default" }, referralBefore ? { $set: { referral: referralBefore } } : { $unset: { referral: "" } });
  }
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against production");
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
