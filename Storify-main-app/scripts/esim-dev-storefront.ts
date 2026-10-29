/**
 * Puts a sample destination on sale in a development store, so the eSIM
 * storefront pages have something to show — sold by the fake supplier,
 * nothing is bought from a real one.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-storefront.ts [--remove]
 *
 * Creates "Dev Europe", a regional destination of 14 countries with their
 * operators and five plans, and publishes it through the real publish code
 * as an active product (/esim/region/dev-europe). Everything it creates
 * carries the slug prefix "dev-europe"; --remove deletes the plans, the
 * product and its link again. Refuses to run with NODE_ENV=production.
 */
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { Product } from "@/models";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProductLink } from "@/models/esim-product-link.model";
import { EsimProvider } from "@/models/esim-provider.model";

const SLUG = "dev-europe-esim";

const COUNTRIES: Array<[string, string, Array<[string, string]>]> = [
  ["AT", "Austria", [["A1", "5G"], ["Magenta", "4G"]]],
  ["BE", "Belgium", [["Proximus", "4G"]]],
  ["HR", "Croatia", [["Hrvatski Telekom", "4G"]]],
  ["CZ", "Czechia", [["O2", "4G"], ["Vodafone", "4G"]]],
  ["DK", "Denmark", [["TDC", "5G"]]],
  ["FR", "France", [["Orange", "5G"], ["SFR", "4G"], ["Bouygues", "5G"]]],
  ["DE", "Germany", [["Telekom", "5G"], ["Vodafone", "5G"], ["O2", "4G"]]],
  ["GR", "Greece", [["Cosmote", "4G"]]],
  ["IE", "Ireland", [["Three", "4G"]]],
  ["IT", "Italy", [["TIM", "5G"], ["Vodafone", "4G"]]],
  ["NL", "Netherlands", [["KPN", "5G"]]],
  ["PT", "Portugal", [["MEO", "4G"]]],
  ["ES", "Spain", [["Movistar", "5G"], ["Orange", "4G"]]],
  ["CH", "Switzerland", []],
];

const PLANS = [
  { gb: 1, days: 7, price: 450, cost: 220 },
  { gb: 3, days: 15, price: 990, cost: 520 },
  { gb: 5, days: 30, price: 1490, cost: 800 },
  { gb: 10, days: 30, price: 2290, cost: 1300 },
  { gb: 20, days: 30, price: 3490, cost: 2100 },
];

async function remove() {
  const link = await EsimProductLink.findOne({ productSlug: SLUG }).lean();
  if (link) await Product.deleteOne({ _id: link.product });
  await EsimProductLink.deleteMany({ productSlug: SLUG });
  const plans = await EsimPlan.deleteMany({ productSlug: SLUG });
  console.log(`Removed the sample destination (${plans.deletedCount} plans).`);
}

async function create() {
  const provider = await EsimProvider.findOne({ code: "fake-fulfil", status: "active" }).lean<{ _id: mongoose.Types.ObjectId } | null>();
  if (!provider) throw new Error("The dev database needs the active fake-fulfil supplier");
  const now = new Date();
  for (const plan of PLANS) {
    const id = `dev-europe-${plan.gb}gb-${plan.days}d`;
    await EsimPlan.updateOne(
      { providerCode: "fake-fulfil", providerPlanId: id },
      {
        $set: {
          provider: provider._id,
          providerCode: "fake-fulfil",
          providerPlanId: id,
          name: `Dev Europe ${plan.gb}GB ${plan.days} days`,
          slug: id,
          productSlug: SLUG,
          destination: "Dev Europe",
          emoji: "🇪🇺",
          coverage: {
            scope: "regional",
            countries: COUNTRIES.map(([code, name]) => ({ code, name })),
            networks: COUNTRIES.flatMap(([code, , operators]) => operators.map(([operator, network]) => ({ countryCode: code, operator, network }))),
            breakoutIp: [],
          },
          data: { megabytes: plan.gb * 1024, label: `${plan.gb}GB`, type: "total" },
          validityDays: plan.days,
          duration: { configurable: false, defaultDays: plan.days, minDays: plan.days, maxDays: plan.days },
          speed: ["5G", "4G"],
          tethering: true,
          activation: { billingStarts: "first_connection", preInstallDays: 180 },
          topup: { supported: plan.gb >= 5, mode: plan.gb >= 5 ? "stack" : "none", stackTarget: "data", window: "before_expiry", coverage: "same_area" },
          cost: { currency: "USD", amountMinor: plan.cost, billingUnit: "plan" },
          available: true,
          syncedAt: now,
          contentHash: id,
          status: "active",
          retailPriceMinor: plan.price,
          retailPriceManual: true,
        },
      },
      { upsert: true },
    );
  }
  const { publishProducts } = await import("@/lib/esim/catalog/publish");
  const result = await publishProducts({ productSlugs: [SLUG], status: "active" });
  console.log(`Published: ${JSON.stringify(result)}`);
  console.log("Open /esim/region/dev-europe (the storefront cache can take a few minutes, or restart the dev server).");
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against production");
  process.env.ESIM_ENABLE_FAKE_PROVIDER = "true";
  await connectDB();
  try {
    if (process.argv.includes("--remove")) await remove();
    else await create();
  } finally {
    await disconnectDB();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
