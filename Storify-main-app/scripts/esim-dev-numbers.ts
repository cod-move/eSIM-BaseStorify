/**
 * End-to-end check of the number-card stock (NUM-01) in a development
 * database: a check-only import, the import, a repeat that skips what is
 * there, the list's filters and search, editing, taking off sale, removing;
 * then the fake TopConnect gateway through the supplier registry. Uses its own
 * batch of numbers and removes them at the end.
 *
 *   ESIM_ENABLE_FAKE_PROVIDER=true pnpm exec tsx --env-file-if-exists=.env \
 *     --require ./scripts/lib/finance-cli.cjs scripts/esim-dev-numbers.ts
 *
 * Refuses to run with NODE_ENV=production.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB } from "@/lib/db";
import { EsimNumber } from "@/models/esim-number.model";

const BATCH = "dev-script-numbers";
const LPA = "LPA:1$rsp.fake.invalid$DEV";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against production");
  await connectDB();
  const { importNumbers, listNumbersAdmin, updateNumber, deleteNumbers } = await import("@/lib/esim/admin/numbers");
  const { topConnectClient } = await import("@/lib/esim/providers/registry");
  await EsimNumber.deleteMany({ batch: BATCH });

  try {
    const text = [
      "MSISDN ICCID LPA PIN1 PUK1 PIN2 PUK2",
      `55590001 8937299900000000001 ${LPA}1 1234 12345678 5678 87654321`,
      `55590002 8937299900000000002 ${LPA}2 1234 12345678 5678 87654321 25 10`,
      `55590003 not-an-iccid ${LPA}3`,
    ].join("\n");
    const options = { dialCode: "372", priceMinor: 1500, premiumMinor: 0, batch: BATCH };

    const check = await importNumbers(text, { ...options, dryRun: true });
    assert.deepEqual([check.imported, check.existing, check.problems.map((problem) => problem.reason)], [2, 0, ["iccid"]]);
    assert.equal(await EsimNumber.countDocuments({ batch: BATCH }), 0, "a check writes nothing");

    const first = await importNumbers(text, options);
    assert.deepEqual([first.imported, first.existing], [2, 0]);
    const again = await importNumbers(text, options);
    assert.deepEqual([again.imported, again.existing], [0, 2], "a repeat skips numbers already in stock");

    const stored = await EsimNumber.findOne({ msisdn: "37255590002" }).select("+install").lean();
    assert.ok(stored);
    assert.equal(stored.priceMinor, 2500);
    assert.equal(stored.premiumMinor, 1000);
    assert.equal(stored.install.pin1, "1234");
    const plain = await EsimNumber.findOne({ msisdn: "37255590002" }).lean();
    assert.equal(plain!.install, undefined, "install details are not read unless asked for");

    const byBatch = await listNumbersAdmin({ search: BATCH });
    assert.deepEqual(byBatch.rows.map((row) => row.msisdn).sort(), ["37255590001", "37255590002"]);
    const byNumber = await listNumbersAdmin({ search: "+372 5559 0001" });
    assert.deepEqual(byNumber.rows.map((row) => row.msisdn), ["37255590001"]);
    assert.ok((await listNumbersAdmin({ dialCode: "372", status: "available" })).rows.some((row) => row.batch === BATCH));

    const id = byNumber.rows[0]!.id;
    const change = await updateNumber(id, { premiumMinor: 3000, note: "Easy to remember" });
    assert.equal(change.before.premiumMinor, 0);
    await updateNumber(id, { status: "retired" });
    assert.ok((await listNumbersAdmin({ status: "retired", search: BATCH })).rows.some((row) => row.id === id));

    await EsimNumber.updateOne({ msisdn: "37255590002" }, { $set: { status: "sold" } });
    const soldId = String((await EsimNumber.findOne({ msisdn: "37255590002" }).lean())!._id);
    await assert.rejects(updateNumber(soldId, { priceMinor: 1 }), /not sold or held/);
    const removed = await deleteNumbers([id, soldId]);
    assert.deepEqual(removed, ["37255590001"], "a sold number is never removed");

    if (process.env.ESIM_ENABLE_FAKE_PROVIDER === "true") {
      const gateway = topConnectClient({ baseUrl: "fake://topconnect" });
      const status = await gateway.cardStatus({ msisdn: "37255590002" });
      assert.equal(status.card.msisdn, "37255590002");
      console.log("Fake TopConnect gateway answered through the registry.");
    } else {
      console.log("Skipped the fake gateway (ESIM_ENABLE_FAKE_PROVIDER is not true).");
    }
    console.log("Number stock check passed.");
  } finally {
    const left = await EsimNumber.deleteMany({ batch: BATCH });
    console.log(`Cleaned up ${left.deletedCount} test numbers.`);
  }
}

main()
  .catch((error) => {
    console.error("FAILED:", error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
