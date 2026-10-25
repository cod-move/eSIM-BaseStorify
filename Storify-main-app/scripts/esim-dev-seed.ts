/**
 * Gives a development account some eSIMs to look at, issued by the fake
 * supplier — nothing is bought from a real one.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-seed.ts <customer email> [--remove]
 *
 * Creates three paid orders for the account and fulfils them through the real
 * fulfilment code, then sets one eSIM in use (18% left) and one expired, so
 * the "My eSIMs" pages show their states. Everything it creates carries the
 * order-number prefix "DEV-ESIM-"; --remove deletes it again. Refuses to run
 * with NODE_ENV=production.
 */
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { Order, User } from "@/models";
import { EsimFulfillment } from "@/models/esim-fulfillment.model";
import { EsimPackage } from "@/models/esim-package.model";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProductLink } from "@/models/esim-product-link.model";
import { EsimProfile } from "@/models/esim-profile.model";
import { EsimProvider } from "@/models/esim-provider.model";

const PREFIX = "DEV-ESIM-";
const { ObjectId } = mongoose.Types;

async function remove() {
  const orders = await Order.collection.find({ orderNumber: { $regex: `^${PREFIX}` } }).project({ _id: 1 }).toArray();
  const ids = orders.map((order) => order._id);
  const profiles = await EsimProfile.find({ order: { $in: ids } }).select({ _id: 1 }).lean();
  await EsimPackage.deleteMany({ esim: { $in: profiles.map((profile) => profile._id) } });
  await EsimProfile.deleteMany({ order: { $in: ids } });
  await EsimFulfillment.deleteMany({ order: { $in: ids } });
  await Order.collection.deleteMany({ _id: { $in: ids } });
  await EsimProductLink.deleteMany({ productSlug: { $regex: `^${PREFIX.toLowerCase()}` } });
  await EsimPlan.deleteMany({ providerCode: "fake-fulfil", productSlug: { $regex: `^${PREFIX.toLowerCase()}` } });
  console.log(`Removed ${ids.length} dev orders and their eSIMs.`);
}

async function plan(providerId: unknown, name: string, emoji: string, country: [string, string], megabytes: number, days: number) {
  const slug = `${PREFIX.toLowerCase()}${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  await EsimPlan.deleteOne({ providerCode: "fake-fulfil", slug });
  const doc = new EsimPlan({
    provider: providerId,
    providerCode: "fake-fulfil",
    providerPlanId: slug,
    name,
    slug,
    productSlug: slug,
    destination: country[1],
    emoji,
    coverage: { scope: "local", countries: [{ code: country[0], name: country[1] }], networks: [], breakoutIp: [] },
    data: { megabytes, label: megabytes >= 1024 ? `${megabytes / 1024}GB` : `${megabytes}MB`, type: "total" },
    validityDays: days,
    duration: { configurable: false, defaultDays: days, minDays: days, maxDays: days },
    activation: { billingStarts: "first_connection", preInstallDays: 180 },
    topup: { supported: true, mode: "stack", stackTarget: "data", window: "before_expiry", coverage: "same_area" },
    cost: { currency: "USD", amountMinor: 300, billingUnit: "plan" },
    bundles: [{ type: "vpn", validityDays: days + 7 }],
    syncedAt: new Date(),
    contentHash: "dev",
    status: "active",
    retailPriceMinor: 599,
  });
  await doc.save();
  return doc;
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against production");
  const [email, flag] = process.argv.slice(2);
  await connectDB();
  if (flag === "--remove" || email === "--remove") {
    await remove();
    return;
  }
  if (!email) throw new Error("Usage: esim-dev-seed.ts <customer email> [--remove]");
  const user = await User.findOne({ email: email.toLowerCase() }).select({ _id: 1 }).lean<{ _id: mongoose.Types.ObjectId } | null>();
  if (!user) throw new Error(`No account with email ${email}`);

  process.env.ESIM_ENABLE_FAKE_PROVIDER = "true";
  const provider =
    (await EsimProvider.findOne({ code: "fake-fulfil" })) ??
    (await new EsimProvider({ code: "fake-fulfil", name: "Fake fulfil", status: "active", settlementCurrency: "USD", credentials: { mode: "fulfil" } }).save());

  const plans = [
    await plan(provider._id, "Japan 5GB 30Days", "🇯🇵", ["JP", "Japan"], 5120, 30),
    await plan(provider._id, "Thailand 10GB 15Days", "🇹🇭", ["TH", "Thailand"], 10240, 15),
    await plan(provider._id, "France 3GB 7Days", "🇫🇷", ["FR", "France"], 3072, 7),
  ];
  const fulfilment = await import("@/lib/esim/fulfillment");
  const profiles = [];
  for (const [index, item] of plans.entries()) {
    const variantId = new ObjectId();
    await new EsimProductLink({
      productSlug: item.productSlug,
      product: new ObjectId(),
      variants: [{ key: `total|${item.data.megabytes}|${item.validityDays}`, variantId, name: item.name, priceMinor: 599, candidates: [item._id] }],
      publishedAt: new Date(),
    }).save();
    const vendorId = new ObjectId();
    const { insertedId } = await Order.collection.insertOne({
      orderNumber: `${PREFIX}${Date.now()}-${index + 1}`,
      customerId: user._id,
      status: "processing",
      paymentStatus: "paid",
      currency: "USD",
      subtotal: 5.99,
      total: 5.99,
      items: [{ productId: new ObjectId(), variantId, vendorId, name: item.name, sku: "DEV", price: 5.99, quantity: 1 }],
      subOrders: [{ _id: new ObjectId(), vendorId, status: "processing", items: [] }],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await fulfilment.esimQueueOrder(String(insertedId));
    await fulfilment.esimFulfilOrder(String(insertedId));
    profiles.push(await EsimProfile.findOne({ order: insertedId }));
  }

  const day = 86_400_000;
  const [, inUse, expired] = profiles;
  if (inUse) {
    await EsimProfile.updateOne({ _id: inUse._id }, {
      $set: {
        "lifecycle.status": "in_use",
        "lifecycle.installed": true,
        "lifecycle.activationDetectedAt": new Date(Date.now() - 3 * day),
        expiresAt: new Date(Date.now() + 12 * day),
        usage: { totalBytes: 10 * 1024 ** 3, usedBytes: 8.2 * 1024 ** 3, remainingBytes: 1.8 * 1024 ** 3, expiresAt: new Date(Date.now() + 12 * day), syncedAt: new Date(), stale: false },
        // Far enough back that the page's refresh button is allowed straight away.
        "lifecycle.lastUsageUpdateAt": new Date(Date.now() - 10 * 60_000),
      },
    });
  }
  if (expired) {
    await EsimProfile.updateOne({ _id: expired._id }, {
      $set: { "lifecycle.status": "expired", "lifecycle.installed": true, expiresAt: new Date(Date.now() - 2 * day), usage: null },
    });
  }
  console.log(`Seeded ${profiles.length} eSIMs for ${email}: ready to install, in use (18% left), expired.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
