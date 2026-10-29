/**
 * Check of fetching a plan's operators on demand (CAT-10) against a
 * development database, with the fake supplier — no real supplier is asked.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-networks.ts
 *
 * A regional plan with no operators gets them from the supplier, once a week
 * at most; a plan whose catalogue already names them is not asked about; an
 * empty answer is not asked again either. The product page's facts read the
 * fetched operators. Removes what it made and reports any collection whose
 * count changed. Refuses to run with NODE_ENV=production.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProductLink } from "@/models/esim-product-link.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { EsimProviderLog } from "@/models/esim-provider-log.model";

const { ObjectId } = mongoose.Types;
type Id = mongoose.Types.ObjectId;
const tag = `e2e-nets-${Date.now()}`;
const made = { plans: [] as Id[], links: [] as Id[] };

async function counts() {
  const db = mongoose.connection.db!;
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  return new Map(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const)));
}

async function plan(providerId: unknown, suffix: string, networks: Array<{ countryCode: string; operator: string; network: string | null }>) {
  const doc = new EsimPlan({
    provider: providerId,
    providerCode: "fake-fulfil",
    providerPlanId: `${tag}-${suffix}`,
    name: `Networks test ${suffix}`,
    slug: `${tag}-${suffix}`,
    productSlug: tag,
    destination: "Testland",
    coverage: { scope: "regional", countries: [{ code: "FR", name: "France" }, { code: "DE", name: "Germany" }], networks, breakoutIp: [] },
    data: { megabytes: 1024, label: "1GB", type: "total" },
    validityDays: 7,
    duration: { configurable: false, defaultDays: 7, minDays: 7, maxDays: 7 },
    activation: { billingStarts: "first_connection", preInstallDays: 30 },
    topup: { supported: false, mode: "none", window: null },
    cost: { currency: "USD", amountMinor: 100, billingUnit: "plan" },
    syncedAt: new Date(),
    contentHash: tag,
    status: "active",
    retailPriceMinor: 199,
  });
  await doc.save();
  made.plans.push(doc._id as Id);
  return doc._id as Id;
}

async function run() {
  process.env.ESIM_ENABLE_FAKE_PROVIDER = "true";
  const { fillMissingNetworks } = await import("@/lib/esim/catalog/networks");
  const { productEsimFacts } = await import("@/lib/esim/storefront/catalog");
  const fake = await EsimProvider.findOne({ code: "fake-fulfil", status: "active" }).lean<{ _id: Id } | null>();
  assert.ok(fake, "the dev database needs the active fake-fulfil supplier (run scripts/esim-dev-seed.ts)");

  console.log("1. a plan without operators gets them, once a week at most");
  const bare = await plan(fake._id, "bare", []);
  assert.equal(await fillMissingNetworks([bare]), 1);
  const filled = await EsimPlan.findById(bare).lean();
  assert.deepEqual(filled?.supplierNetworks?.list.map((entry) => entry.operator), ["Fake Orange", "Fake SFR"]);
  assert.equal(filled?.coverage.networks.length, 0, "the catalogue's own field is left alone");
  assert.equal(await fillMissingNetworks([bare]), 0, "not asked again this week");
  assert.equal(await EsimProviderLog.countDocuments({ "refs.planId": String(bare), operation: "plan.networks" }), 1);

  console.log("2. not asked: a plan the catalogue names operators for; an empty answer is kept for a week too");
  const named = await plan(fake._id, "named", [{ countryCode: "FR", operator: "Orange", network: "5G" }]);
  const empty = await plan(fake._id, "nonets", []);
  assert.equal(await fillMissingNetworks([named, empty]), 0);
  assert.equal(await EsimProviderLog.countDocuments({ "refs.planId": String(named) }), 0);
  assert.ok((await EsimPlan.findById(empty).lean())?.supplierNetworks?.checkedAt, "the empty answer is remembered");
  assert.equal(await fillMissingNetworks([empty]), 0);
  assert.equal(await EsimProviderLog.countDocuments({ "refs.planId": String(empty), operation: "plan.networks" }), 1);

  console.log("3. the product's facts show the fetched operators");
  const productId = new ObjectId();
  const linkDoc = new EsimProductLink({
    productSlug: tag,
    product: productId,
    variants: [{ key: "total|1024|7", variantId: new ObjectId(), name: "1GB / 7 days", priceMinor: 199, candidates: [bare] }],
    publishedAt: new Date(),
  });
  await linkDoc.save();
  made.links.push(linkDoc._id as Id);
  const facts = await productEsimFacts(String(productId));
  assert.deepEqual(facts?.networks.map((entry) => entry.operator).sort(), ["Fake Orange", "Fake SFR"]);
  console.log("All network checks passed.");
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against production");
  await connectDB();
  const before = await counts();
  try {
    await run();
  } finally {
    await EsimProviderLog.deleteMany({ "refs.planId": { $in: made.plans.map(String) } });
    await EsimProductLink.deleteMany({ _id: { $in: made.links } });
    await EsimPlan.deleteMany({ _id: { $in: made.plans } });
    const after = await counts();
    const changed = [...after].filter(([name, count]) => (before.get(name) ?? 0) !== count);
    console.log(changed.length ? `Collections changed: ${JSON.stringify(changed)}` : "Cleanup left every collection as it was.");
    await disconnectDB();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
