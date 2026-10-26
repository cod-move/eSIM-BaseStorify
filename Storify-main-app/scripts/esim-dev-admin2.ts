/**
 * End-to-end check of the destination, mapping, device and scheduled-job
 * admin (ADM-02/06/10/11) against a development database, with fake
 * suppliers — nothing is bought.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-admin2.ts
 *
 * Publishes a fake destination as a store product, then removes everything it
 * created and reports any collection whose count changed. The device table
 * and the fulfilment job's run record are put back as they were. Refuses to
 * run with NODE_ENV=production.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { Product } from "@/models";
import { CronRun } from "@/models/cron-run.model";
import { EsimDestination } from "@/models/esim-destination.model";
import { EsimDevice } from "@/models/esim-device.model";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProductLink } from "@/models/esim-product-link.model";
import { EsimProvider } from "@/models/esim-provider.model";

const tag = `e2e-adm2-${Date.now()}`;
const slug = `${tag}-japan`;
type Id = mongoose.Types.ObjectId;
const created = { providers: [] as Id[], product: null as Id | null };
let devicesBefore: Array<Record<string, unknown>> = [];
let cronBefore: Record<string, unknown> | null = null;

async function counts() {
  const db = mongoose.connection.db!;
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  return new Map(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const)));
}

async function provider(code: string) {
  const existing = await EsimProvider.findOne({ code });
  if (existing) return existing;
  const doc = await new EsimProvider({ code, name: code, status: "active", settlementCurrency: "USD", credentials: { mode: "fulfil" } }).save();
  created.providers.push(doc._id as Id);
  return doc;
}

async function plan(code: string, retailPriceMinor: number) {
  const supplier = await provider(code);
  return new EsimPlan({
    provider: supplier._id,
    providerCode: code,
    providerPlanId: `${tag}-${code}`,
    name: `Japan 5GB 30Days (${code})`,
    slug: `${tag}-${code}`,
    productSlug: slug,
    destination: `Japan ${tag}`,
    coverage: { scope: "local", countries: [{ code: "JP", name: "Japan" }], networks: [], breakoutIp: [] },
    data: { megabytes: 5120, label: "5GB", type: "total" },
    validityDays: 30,
    duration: { configurable: false, defaultDays: 30, minDays: 30, maxDays: 30 },
    activation: { billingStarts: "first_connection", preInstallDays: 180 },
    topup: { supported: false },
    cost: { currency: "USD", amountMinor: 300, billingUnit: "plan" },
    pricing: { costUsdMinor: 300, usdPerUnit: 1, ruleId: null, markupPercent: 50, marginFloorApplied: false, pricedAt: new Date() },
    syncedAt: new Date(),
    contentHash: tag,
    status: "active",
    available: true,
    retailPriceMinor,
  }).save();
}

async function run() {
  process.env.ESIM_ENABLE_FAKE_PROVIDER = "true";
  const jobs = await import("@/lib/esim/admin/jobs");
  const destinations = await import("@/lib/esim/admin/destinations");
  const devices = await import("@/lib/esim/admin/devices");

  // Scheduled jobs: listed, and a manual run is recorded like a scheduled one.
  cronBefore = await CronRun.findOne({ job: "esim-fulfillment" }).lean();
  const listed = await jobs.listJobs();
  assert.deepEqual(listed.map((job) => job.job), ["esim-fulfillment", "esim-catalog", "esim-fx"]);
  const result = await jobs.runJobNow("esim-fulfillment");
  assert.equal(result.ok, true);
  const after = (await jobs.listJobs()).find((job) => job.job === "esim-fulfillment")!;
  assert.equal(after.lastStatus, "ok");
  assert.equal(after.stale, false);
  console.log("✓ scheduled jobs: listed, run by hand, recorded");

  // Destinations: two suppliers for one variant, published; the cheaper leads until another is pinned.
  const cheap = await plan("fake-fulfil", 699);
  const dear = await plan("fake-pending", 899);
  const { publishDestinationList } = destinations;
  await publishDestinationList([slug], "draft");
  let link = await EsimProductLink.findOne({ productSlug: slug }).lean();
  assert.ok(link);
  created.product = link.product as Id;
  assert.equal(String(link.variants[0].candidates[0]), String(cheap._id), "the cheaper plan is primary");
  const list = await destinations.listDestinationsAdmin({ search: tag });
  assert.equal(list.rows.length, 1);
  assert.equal(list.rows[0].activePlans, 2);
  assert.equal(list.rows[0].productStatus, "draft");
  await destinations.setFeatured([slug], true);
  assert.equal((await destinations.listDestinationsAdmin({ search: tag, featured: true })).rows.length, 1);

  const key = link.variants[0].key;
  await destinations.setPin(slug, key, String(dear._id));
  link = await EsimProductLink.findOne({ productSlug: slug }).lean();
  assert.equal(String(link!.variants[0].candidates[0]), String(dear._id), "the pinned plan leads");
  assert.equal(link!.variants[0].priceMinor, 899, "and sets the price");
  const product = await Product.findById(created.product).lean<{ variants: Array<{ price: number }> }>();
  assert.equal(product!.variants[0].price, 8.99, "the store product follows");
  const mapping = await destinations.getDestinationMapping(slug);
  assert.equal(mapping?.variants[0].pinned, String(dear._id));
  await destinations.setPin(slug, key, null);
  link = await EsimProductLink.findOne({ productSlug: slug }).lean();
  assert.equal(String(link!.variants[0].candidates[0]), String(cheap._id), "unpinned: cheapest first again");
  await assert.rejects(() => destinations.setPin(slug, key, String(new mongoose.Types.ObjectId())), /does not belong/);
  await destinations.setDestinationVisibility([slug], true);
  assert.equal((await Product.findById(created.product).lean<{ status: string }>())?.status, "active");
  console.log("✓ destinations: listed, featured, pinned supplier leads and prices the variant, unpinned, shown");

  // Devices: built-in list until the table has rows; import, add, remove.
  devicesBefore = await EsimDevice.find().lean();
  await EsimDevice.deleteMany({});
  assert.equal((await devices.listDevicesAdmin()).usingBuiltIn, true);
  const imported = await devices.importBuiltInDevices();
  assert.ok(imported.added > 100);
  assert.equal((await devices.importBuiltInDevices()).added, 0, "importing again adds nothing");
  await devices.saveDevice({ brand: "Nothing", model: "Phone (3)", supported: false, note: tag });
  const rows = (await devices.listDevicesAdmin("Phone (3)")).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].supported, false);
  await assert.rejects(() => devices.saveDevice({ brand: "Nothing", model: "Phone (3)", supported: true }), /duplicate key/i);
  await devices.deleteDevice(rows[0].id);
  assert.equal((await devices.listDevicesAdmin("Phone (3)")).rows.length, 0);
  console.log("✓ devices: built-in list until imported, import is idempotent, add, refuse a duplicate, remove");
  console.log("All admin checks passed.");
}

async function cleanup() {
  const db = mongoose.connection.db!;
  await EsimDevice.deleteMany({});
  if (devicesBefore.length) await EsimDevice.collection.insertMany(devicesBefore);
  if (cronBefore) await CronRun.collection.replaceOne({ job: "esim-fulfillment" }, cronBefore, { upsert: true });
  else await CronRun.deleteOne({ job: "esim-fulfillment" });
  if (created.product) {
    const productId = created.product;
    for (const name of ["audit_logs", "inventorymovements", "inventory_movements", "metacatalogsyncs", "stockmovements"]) {
      await db.collection(name).deleteMany({ $or: [{ productId }, { productId: String(productId) }, { resourceId: String(productId) }, { sourceId: String(productId) }] }).catch(() => undefined);
    }
    await Product.collection.deleteOne({ _id: productId });
  }
  await EsimProductLink.deleteMany({ productSlug: slug });
  await EsimDestination.deleteMany({ productSlug: slug });
  await EsimPlan.deleteMany({ productSlug: slug });
  await EsimProvider.deleteMany({ _id: { $in: created.providers } });
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
