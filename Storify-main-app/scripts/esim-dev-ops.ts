/**
 * End-to-end check of the admin's fulfilment actions (ADM-07/08/09) against a
 * development database, with fake suppliers — nothing is bought for real.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-ops.ts
 *
 * Guest orders, so refunds stay "by hand" and no store credit moves. Removes
 * everything it created and reports any collection whose count changed.
 * Refuses to run with NODE_ENV=production.
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
import { LedgerEntry } from "@/models/ledger-entry.model";

const tag = `e2e-ops-${Date.now()}`;
type Id = mongoose.Types.ObjectId;
const created = { providers: [] as Id[], plans: [] as Id[], links: [] as Id[], orders: [] as Id[] };

async function counts() {
  const db = mongoose.connection.db!;
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  return new Map(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const)));
}

async function provider(mode: "reject" | "uncertain" | "fulfil") {
  const code = `fake-${mode}`;
  const existing = await EsimProvider.findOne({ code });
  if (existing) return existing;
  const doc = await new EsimProvider({ code, name: `Fake ${mode}`, status: "active", settlementCurrency: "USD", credentials: { mode } }).save();
  created.providers.push(doc._id as Id);
  return doc;
}

async function plan(mode: "reject" | "uncertain" | "fulfil") {
  const supplier = await provider(mode);
  const doc = await new EsimPlan({
    provider: supplier._id,
    providerCode: supplier.code,
    providerPlanId: `${tag}-${mode}`,
    name: `Japan 1GB 7Days (${mode})`,
    slug: `${tag}-${mode}`,
    productSlug: `${tag}-japan`,
    destination: "Japan",
    coverage: { scope: "local", countries: [{ code: "JP", name: "Japan" }], networks: [], breakoutIp: [] },
    data: { megabytes: 1024, label: "1GB", type: "total" },
    validityDays: 7,
    duration: { configurable: false, defaultDays: 7, minDays: 7, maxDays: 7 },
    activation: { billingStarts: "first_connection", preInstallDays: 180 },
    topup: { supported: false },
    cost: { currency: "USD", amountMinor: 300, billingUnit: "plan" },
    syncedAt: new Date(),
    contentHash: tag,
    status: "active",
    retailPriceMinor: 599,
  }).save();
  created.plans.push(doc._id as Id);
  return doc;
}

async function order(candidates: Id[], n: number) {
  const variantId = new mongoose.Types.ObjectId();
  const link = await new EsimProductLink({
    productSlug: `${tag}-${n}`,
    product: new mongoose.Types.ObjectId(),
    variants: [{ key: `total|1024|7|${n}`, variantId, name: "1GB / 7 days", priceMinor: 599, candidates }],
    publishedAt: new Date(),
  }).save();
  created.links.push(link._id as Id);
  const vendorId = new mongoose.Types.ObjectId();
  const { insertedId } = await Order.collection.insertOne({
    orderNumber: `${tag}-${n}`,
    guestEmail: `${tag}@esim.test`,
    status: "processing",
    paymentStatus: "paid",
    currency: "USD",
    subtotal: 5.99,
    total: 5.99,
    items: [{ productId: link.product, variantId, vendorId, name: "Japan eSIM", sku: "DEV", price: 5.99, quantity: 1 }],
    subOrders: [{ _id: new mongoose.Types.ObjectId(), vendorId, status: "processing", items: [] }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  created.orders.push(insertedId);
  return String(insertedId);
}

async function run() {
  process.env.ESIM_ENABLE_FAKE_PROVIDER = "true";
  const fulfilment = await import("@/lib/esim/fulfillment");
  const { settleOrderDelivery } = await import("@/lib/esim/fulfillment/delivery");
  const service = await import("@/lib/esim/fulfillment/service");
  const { listQueue } = await import("@/lib/esim/admin/queue");
  const { listAdminEsims, getAdminEsim, adminCancelEsim } = await import("@/lib/esim/admin/esims");
  const { listLogs } = await import("@/lib/esim/admin/logs");
  const job = async (orderId: string) => (await EsimFulfillment.findOne({ order: orderId }))!;
  const refused = (run: () => Promise<unknown>, pattern: RegExp) => assert.rejects(run, (error: Error) => pattern.test(error.message));

  const reject = await plan("reject");
  const uncertain = await plan("uncertain");
  const fulfil = await plan("fulfil");

  // A. Every supplier refuses: failed, a guest's refund waits for a person.
  const a = await order([reject._id as Id], 1);
  await fulfilment.esimQueueOrder(a);
  await fulfilment.esimFulfilOrder(a);
  let jobA = await job(a);
  assert.equal(jobA.state, "failed");
  assert.equal(jobA.refund?.state, "manual");
  const queue = await listQueue("attention", { search: tag });
  assert.ok(queue.rows.some((row) => row.orderId === a), "the failed guest order is in the queue");
  // Try again: the refund waiting for a person is called off, and it fails again.
  await service.adminRetryJob(String(jobA._id), { actor: "e2e" });
  jobA = await job(a);
  assert.equal(jobA.state, "queued");
  assert.equal(jobA.refund ?? null, null);
  await fulfilment.esimFulfilOrder(a);
  assert.equal((await job(a)).state, "failed");
  await service.adminMarkRefunded(String(jobA._id), "Refunded on the gateway", "e2e");
  assert.equal((await job(a)).refund?.state, "done");
  await refused(() => service.adminRetryJob(String(jobA._id)), /already refunded/);
  console.log("✓ failed guest eSIM: queued for a person, retried, marked refunded, then closed");

  // B. An uncertain supplier: no switching while it may still deliver; give up; bind one bought by hand.
  const b = await order([uncertain._id as Id, fulfil._id as Id], 2);
  await fulfilment.esimQueueOrder(b);
  await fulfilment.esimFulfilOrder(b);
  let jobB = await job(b);
  assert.equal(jobB.state, "queued", "an uncertain answer is retried, not failed over");
  assert.equal(jobB.lastError?.code, "uncertain");
  await refused(() => service.adminRetryJob(String(jobB._id), { candidateIndex: 1 }), /may still deliver/);
  await service.adminFailJob(String(jobB._id), "e2e");
  await settleOrderDelivery(b);
  jobB = await job(b);
  assert.equal(jobB.state, "failed");
  assert.equal(jobB.refund?.state, "manual");
  await refused(() => service.adminBindEsim(String(jobB._id), { candidateIndex: 1, iccid: "12345" }), /not an ICCID/);
  const iccid = `8999${String(Date.now()).padStart(15, "0")}`;
  const bound = await service.adminBindEsim(String(jobB._id), { candidateIndex: 1, iccid, actor: "e2e" });
  await settleOrderDelivery(b);
  jobB = await job(b);
  assert.equal(jobB.state, "fulfilled");
  assert.equal(jobB.refund ?? null, null, "the refund is called off");
  assert.ok(jobB.deliveredAt, "the bound eSIM is delivered");
  const profile = await EsimProfile.findById(bound.profileId).lean();
  assert.equal(profile?.iccid, iccid);
  await refused(() => service.adminBindEsim(String(jobB._id), { candidateIndex: 1, iccid }), /already issued/);
  console.log("✓ uncertain supplier: switching refused, given up, eSIM bought by hand bound and delivered");

  // C. The eSIM pages and the call log find it; cancelling works where the supplier allows.
  const listed = await listAdminEsims({ search: iccid });
  assert.equal(listed.rows.length, 1);
  assert.equal(listed.rows[0].customer, `${tag}@esim.test`);
  const detail = await getAdminEsim(bound.profileId!);
  assert.equal(detail.profile.installation.activationCode, "(hidden)", "the activation code stays off the admin page");
  assert.ok(detail.job.history.some((entry: { event: string }) => entry.event === "admin_bind"));
  const logs = await listLogs({ search: iccid });
  assert.ok(logs.rows.some((row) => row.operation === "esim.bind"));
  const cancelled = await adminCancelEsim(bound.profileId!);
  assert.equal(cancelled.cancelled, true);
  assert.equal((await EsimProfile.findById(bound.profileId).lean())?.lifecycle.status, "cancelled");
  console.log("✓ eSIM list, detail and call log find it; cancelled at the supplier");
  console.log("All admin operations checks passed.");
}

async function cleanup() {
  const db = mongoose.connection.db!;
  const orders = created.orders;
  const profiles = await EsimProfile.find({ order: { $in: orders } }).select({ _id: 1 }).lean();
  await EsimPackage.deleteMany({ esim: { $in: profiles.map((profile) => profile._id) } });
  await EsimProfile.deleteMany({ order: { $in: orders } });
  await EsimFulfillment.deleteMany({ order: { $in: orders } });
  await EsimProviderLog.deleteMany({ $or: [{ "refs.orderId": { $in: orders.map(String) } }, { provider: { $in: created.providers } }] });
  // Supplier costs booked for the eSIMs issued (ORD-12).
  await LedgerEntry.deleteMany({ "source.id": { $in: orders } });
  await Order.collection.deleteMany({ _id: { $in: orders } });
  await EsimProductLink.deleteMany({ _id: { $in: created.links } });
  await EsimPlan.deleteMany({ _id: { $in: created.plans } });
  await EsimProvider.deleteMany({ _id: { $in: created.providers } });
  const byTag = new RegExp(tag);
  await db.collection("emailjobs").deleteMany({ $or: [{ subject: byTag }, { to: byTag }] }).catch(() => undefined);
  await db.collection("audit_logs").deleteMany({ $or: [{ resourceName: byTag }, { resourceId: { $in: orders.map(String) } }] }).catch(() => undefined);
  await db.collection("notifications").deleteMany({ $or: [{ message: byTag }, { title: byTag }] }).catch(() => undefined);
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
