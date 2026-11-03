/**
 * End-to-end check of the number data packages (NUM-02) in a development
 * database: loading the fake TopConnect gateway's packets, pricing them by the
 * rules, a hand-set price, putting one on sale, re-pricing after a rate
 * change, and a second load that refreshes a changed cost. Uses a temporary
 * TopConnect supplier on the fake gateway (an existing real one is never
 * called) and one stock number of its own; removes what it made at the end.
 *
 *   pnpm exec tsx --env-file-if-exists=.env \
 *     --require ./scripts/lib/finance-cli.cjs scripts/esim-dev-number-packages.ts
 *
 * Refuses to run with NODE_ENV=production.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB } from "@/lib/db";
import { EsimNumber } from "@/models/esim-number.model";
import { EsimNumberPackage } from "@/models/esim-number-package.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { EsimFxRate } from "@/models/esim-fx-rate.model";

const MSISDN = "37255599999";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against production");
  process.env.ESIM_ENABLE_FAKE_PROVIDER = "true";
  await connectDB();
  const admin = await import("@/lib/esim/admin/number-packages");
  const { repriceNumberPackages } = await import("@/lib/esim/pricing/reprice");

  const existing = await EsimProvider.findOne({ code: "topconnect" }).lean();
  if (existing && (existing.credentials as unknown as Record<string, string> | undefined)?.baseUrl !== "fake://topconnect") {
    console.log("A TopConnect supplier that is not the fake gateway exists here; not touching it. Skipped.");
    return;
  }
  if (await EsimNumberPackage.exists({})) {
    console.log("This database already has number data packages; the check needs an empty list. Skipped.");
    return;
  }
  const madeProvider = !existing;
  if (madeProvider) {
    await EsimProvider.create({ code: "topconnect", name: "TopConnect (dev check)", status: "active", settlementCurrency: "EUR", credentials: { baseUrl: "fake://topconnect" } });
  }
  const manualRate = await EsimFxRate.create({ currency: "EUR", usdPerUnit: 1.1, source: "manual", effectiveAt: new Date() });
  await EsimNumber.create({
    msisdn: MSISDN, dialCode: "372", nationalNumber: "55599999", country: "EE", iccid: "8937299900000099999",
    install: { lpa: "LPA:1$rsp.fake.invalid$PKG" }, priceMinor: 1000, batch: "dev-script-packages",
  });

  try {
    const loaded = await admin.loadPacketsFromTopConnect();
    assert.equal(loaded.msisdn, MSISDN);
    assert.deepEqual(loaded.added.sort(), ["1", "2", "9"]);
    let list = await admin.listNumberPackagesAdmin();
    assert.ok(list.rows.every((row) => row.status === "hidden"), "loaded packets start hidden");
    assert.ok(list.rows.every((row) => row.retailPriceMinor > row.costUsdMinor!), "priced above cost by the rules");
    assert.equal(list.rates.EUR, 1.1);

    const first = list.rows.find((row) => row.packetId === "1")!;
    await admin.setNumberPackageStatus(first.id, "active");
    const second = list.rows.find((row) => row.packetId === "2")!;
    await admin.saveNumberPackage(second.id, {
      packetId: "2", name: "Europe 1 GB", validityDays: second.validityDays, volumeMb: second.volumeMb, incrementStepKb: 1,
      costMinor: second.costMinor, currency: "EUR", countryCodes: ["fr", "DE", "xx1"], retailPriceMinor: 999, status: "active", sortOrder: 5,
    });
    await assert.rejects(
      admin.saveNumberPackage(null, { packetId: "1", name: "Copy", validityDays: 1, volumeMb: null, incrementStepKb: 1, costMinor: 1, currency: "EUR", countryCodes: [], retailPriceMinor: null, status: "hidden", sortOrder: 0 }),
      /already on the list/,
    );

    const before = (await EsimNumberPackage.findOne({ packetId: "1" }).lean())!.retailPriceMinor;
    await EsimFxRate.updateOne({ _id: manualRate._id }, { $set: { usdPerUnit: 1.3 } });
    await repriceNumberPackages();
    const after = await EsimNumberPackage.findOne({ packetId: "1" }).lean();
    assert.ok(after!.retailPriceMinor > before, "a stronger euro raises an automatic price");
    const manual = await EsimNumberPackage.findOne({ packetId: "2" }).lean();
    assert.equal(manual!.retailPriceMinor, 999, "a hand-set price stays");
    assert.deepEqual(manual!.countryCodes, ["FR", "DE"]);

    await EsimNumberPackage.updateOne({ packetId: "1" }, { $set: { "cost.amountMinor": 1 } });
    const reloaded = await admin.loadPacketsFromTopConnect(MSISDN);
    assert.deepEqual([reloaded.added, reloaded.updated], [[], ["1"]]);
    assert.equal((await EsimNumberPackage.findOne({ packetId: "2" }).lean())!.name, "Europe 1 GB", "a reload keeps the admin's name");

    list = await admin.listNumberPackagesAdmin();
    assert.deepEqual(list.rows.filter((row) => row.status === "active").map((row) => row.packetId), ["2", "1"]);
    console.log("Number data package check passed.");
  } finally {
    await EsimNumberPackage.deleteMany({ providerCode: "topconnect" });
    await EsimNumber.deleteMany({ batch: "dev-script-packages" });
    await EsimFxRate.deleteOne({ _id: manualRate._id });
    if (madeProvider) await EsimProvider.deleteOne({ code: "topconnect" });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
