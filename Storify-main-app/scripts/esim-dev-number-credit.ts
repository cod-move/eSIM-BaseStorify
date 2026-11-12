/**
 * End-to-end check of an admin adding credit to a number card and deducting
 * it (Admin → eSIM → Numbers → Card credit) against a development database
 * and the fake TopConnect gateway — nothing is sent to TopConnect. Skips
 * itself when a real TopConnect supplier is set up here.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-number-credit.ts
 *
 * Adds €10, deducts €3, refuses to take the card below zero, deducts once
 * for one key, and a deduction whose answer is lost is settled from the
 * card's transfer log on the retry (applied once, never twice). Removes
 * everything it made and reports any collection whose count changed.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { EsimNumber } from "@/models/esim-number.model";
import { EsimNumberAdjustment } from "@/models/esim-number-adjustment.model";
import { EsimNumberSequence } from "@/models/esim-number-sequence.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { EsimProviderLog } from "@/models/esim-provider-log.model";

const tag = `e2e-card-credit-${Date.now()}`;
const MSISDN = `3725557${String(Date.now()).slice(-4)}`;
type Id = mongoose.Types.ObjectId;
const created = { numbers: [] as Id[], provider: null as Id | null, sequence: undefined as Record<string, unknown> | null | undefined };

async function counts() {
  const db = mongoose.connection.db!;
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  return new Map(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const)));
}

async function run() {
  const existing = await EsimProvider.findOne({ code: "topconnect" }).lean();
  if (existing && (existing.credentials as unknown as Record<string, string> | undefined)?.baseUrl !== "fake://topconnect") {
    console.log("A TopConnect supplier that is not the fake gateway is set up here; not touching it. Skipped.");
    return;
  }
  if (!existing) {
    created.provider = (await EsimProvider.create({ code: "topconnect", name: "TopConnect (dev check)", status: "active", settlementCurrency: "EUR", credentials: { baseUrl: "fake://topconnect" } }))._id as Id;
  }
  created.sequence = await EsimNumberSequence.findById("topconnect").lean<Record<string, unknown> | null>();
  const { adjustCardCredit, processCardAdjustments, cardCreditView } = await import("@/lib/esim/numbers/admin-adjust");
  const { sharedFakeTopConnectState } = await import("@/lib/esim/providers/topconnect-fake");
  const fake = sharedFakeTopConnectState();

  const number = await EsimNumber.create({
    msisdn: MSISDN, dialCode: "372", nationalNumber: MSISDN.slice(3), country: "EE", iccid: `89372999${String(Date.now()).slice(-11)}`,
    install: { lpa: `LPA:1$rsp.fake.invalid$${tag}` }, priceMinor: 1500, batch: tag,
  });
  created.numbers.push(number._id as Id);
  const id = String(number._id);
  const card = () => fake.cards.get(MSISDN)?.balanceMinor ?? 0;
  const admin = { id: "e2e", email: `${tag}@esim.test` };
  const adjust = (direction: "add" | "deduct", amountMinor: number, key: string) =>
    adjustCardCredit({ numberId: id, direction, amountMinor, reason: `${tag} check`, key: `${tag}:${key}`, admin });

  // 1. Add €10.
  const dealer = fake.accountMinor;
  const added = await adjust("add", 1000, "a");
  assert.ok(added?.ok && added.adjustment.state === "completed", JSON.stringify(added));
  assert.equal(card(), 1000);
  assert.equal(fake.accountMinor, dealer - 1000, "from the dealer account");
  assert.equal(added.balanceMinor, 1000, "the card read again after");
  assert.equal(added.adjustment.balanceBeforeMinor, 0);
  assert.equal((await EsimNumber.findById(id).lean())?.card?.balanceMinor, 1000);
  console.log("✓ €10 added from the dealer account; the card's balance read again");

  // 2. Deduct €3; the same key again moves nothing.
  const deducted = await adjust("deduct", 300, "b");
  assert.ok(deducted?.ok && deducted.adjustment.state === "completed");
  assert.equal(card(), 700);
  const again = await adjust("deduct", 300, "b");
  assert.ok(again?.ok && again.created === false);
  assert.equal(card(), 700, "once per key");
  console.log("✓ €3 deducted, once for one key");

  // 3. Never below zero.
  const over = await adjust("deduct", 701, "c");
  assert.deepEqual(over, { ok: false, message: "The amount is more than the card's balance" });
  assert.equal(card(), 700);
  assert.equal(await EsimNumberAdjustment.exists({ key: `${tag}:c` }), null, "nothing saved");
  console.log("✓ a deduction past the balance is refused before anything is sent");

  // 4. The answer is lost: applied once, settled from the card's log on the retry.
  fake.loseAnswers = 1;
  const lost = await adjust("deduct", 200, "d");
  assert.ok(lost?.ok && lost.adjustment.state === "processing", JSON.stringify(lost));
  assert.equal(card(), 500, "applied at TopConnect");
  const blocked = await adjust("add", 100, "e");
  assert.deepEqual(blocked, { ok: false, message: "A change to this card's credit is still being made; try again in a few minutes" });
  await EsimNumberAdjustment.updateOne({ key: `${tag}:d` }, { $set: { nextAttemptAt: new Date() } });
  const retried = await processCardAdjustments({ number: id });
  assert.equal(retried.completed, 1);
  assert.equal(card(), 500, "not deducted twice");
  console.log("✓ a lost answer is settled on the retry, without deducting twice");

  const view = await cardCreditView(id);
  assert.deepEqual(view?.adjustments.map((row) => [row.direction, row.amountMinor, row.state]), [
    ["deduct", 200, "completed"],
    ["deduct", 300, "completed"],
    ["add", 1000, "completed"],
  ]);
  console.log("All card credit checks passed.");
}

async function cleanup() {
  await EsimNumberAdjustment.deleteMany({ key: new RegExp(`^${tag}:`) });
  await EsimNumber.deleteMany({ _id: { $in: created.numbers } });
  if (created.sequence !== undefined) {
    await EsimNumberSequence.deleteOne({ _id: "topconnect" });
    if (created.sequence) await EsimNumberSequence.collection.insertOne(created.sequence as never);
  }
  if (created.provider) {
    await EsimProviderLog.deleteMany({ provider: created.provider });
    await EsimProvider.deleteOne({ _id: created.provider });
  }
  await mongoose.connection.db!.collection("notifications").deleteMany({ message: new RegExp(MSISDN) }).catch(() => undefined);
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
    console.error("FAILED:", error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
