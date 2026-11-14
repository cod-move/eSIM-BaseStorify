/**
 * End-to-end check of an admin answering a new-QR-code request by pasting
 * the new card (ICCID LPA PIN1 PUK1 PIN2 PUK2) against a development
 * database and the fake TopConnect gateway — nothing is sent to TopConnect.
 * Skips itself when a real TopConnect supplier is set up here.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-qr-replace.ts
 *
 * Refuses a line that is not a card, an ICCID another number has, and a new
 * ICCID TopConnect does not have the number on yet; then moves the number to
 * the new ICCID with its codes and closes the request, telling the shopper
 * (an in-app notice, and an email where email is set up); a declined request
 * tells them too. Removes everything it
 * made and reports any collection whose count changed.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { User } from "@/models";
import { EsimNumber } from "@/models/esim-number.model";
import { EsimNumberRequest } from "@/models/esim-number-request.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { EsimProviderLog } from "@/models/esim-provider-log.model";

const stamp = String(Date.now());
const tag = `e2e-qr-replace-${stamp}`;
const MSISDN = `3725558${stamp.slice(-4)}`;
const OTHER = `3725559${stamp.slice(-4)}`;
const OLD_ICCID = `89372991${stamp.slice(-11)}`;
const NEW_ICCID = `89372992${stamp.slice(-11)}`;
const OTHER_ICCID = `89372993${stamp.slice(-11)}`;
type Id = mongoose.Types.ObjectId;
const created = { numbers: [] as Id[], users: [] as Id[], provider: null as Id | null };

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
  const { completeQrRequest, rejectQrRequest } = await import("@/lib/esim/numbers/requests");
  const { sharedFakeTopConnectState } = await import("@/lib/esim/providers/topconnect-fake");
  const fake = sharedFakeTopConnectState();

  const { insertedId: shopper } = await User.collection.insertOne({ email: `${tag}@esim.test`, name: "E2E Shopper", role: "customer", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
  created.users.push(shopper as Id);
  const base = { dialCode: "372", country: "EE", priceMinor: 1500, batch: tag, status: "sold" as const, customer: shopper, soldAt: new Date() };
  const number = await EsimNumber.create({ ...base, msisdn: MSISDN, nationalNumber: MSISDN.slice(3), iccid: OLD_ICCID, install: { lpa: `LPA:1$rsp.fake.invalid$OLD${stamp}`, pin1: "1111", puk1: "11111111" } });
  const other = await EsimNumber.create({ ...base, msisdn: OTHER, nationalNumber: OTHER.slice(3), iccid: OTHER_ICCID, install: { lpa: `LPA:1$rsp.fake.invalid$OTH${stamp}` } });
  created.numbers.push(number._id as Id, other._id as Id);
  const request = await EsimNumberRequest.create({ kind: "qr", customer: shopper, key: `${tag}:qr`, number: number._id, msisdn: MSISDN, feeMinor: 0, currency: "EUR", state: "pending", nextAttemptAt: new Date() });
  const answer = (card: string) => completeQrRequest("e2e", String(request._id), { card });
  const newLine = `${NEW_ICCID} LPA:1$rsp.fake.invalid$NEW${stamp} 1234 12345678 5678 87654321`;

  // 1. Not a card, or another number's ICCID: refused before TopConnect is asked.
  assert.deepEqual(await answer(`LPA:1$rsp.fake.invalid$NEW${stamp}`), { ok: false, message: "Paste one line: ICCID LPA PIN1 PUK1 PIN2 PUK2, split by spaces" });
  const taken = await answer(`${OTHER_ICCID} LPA:1$rsp.fake.invalid$NEW${stamp}`);
  assert.deepEqual(taken, { ok: false, message: `This ICCID belongs to +${OTHER} here` });
  console.log("✓ a line that is not a card, and another number's ICCID, are refused");

  // 2. TopConnect has not moved the number yet.
  const early = await answer(newLine);
  assert.ok(!early.ok && /TopConnect still has/.test(early.message), JSON.stringify(early));
  assert.equal((await EsimNumber.findById(number._id).lean())?.iccid, OLD_ICCID, "nothing changed");
  console.log("✓ refused while TopConnect still has the number on another ICCID");

  // 3. Moved at TopConnect: the number takes the new card.
  fake.cards.get(MSISDN)!.iccid = NEW_ICCID;
  const done = await answer(newLine);
  assert.ok(done.ok, JSON.stringify(done));
  const after = await EsimNumber.findById(number._id).select("+install").lean();
  assert.equal(after?.iccid, NEW_ICCID);
  assert.deepEqual(after?.install, { lpa: `LPA:1$rsp.fake.invalid$NEW${stamp}`, pin1: "1234", puk1: "12345678", pin2: "5678", puk2: "87654321" });
  assert.ok(after?.card && after.card.checkedAt.getTime() > 0, "the card is read again");
  const closed = await EsimNumberRequest.findById(request._id).lean();
  assert.equal(closed?.state, "completed");
  assert.ok(!JSON.stringify(done).includes("12345678"), "no PUK in the audit");
  console.log("✓ the number moved to the new ICCID with its LPA and PIN/PUK; the request is done");

  const db = mongoose.connection.db!;
  const notice = await db.collection("notifications").findOne({ "data.key": `esim-number-qr-answer:${request._id}` });
  assert.equal(notice?.title, "Your new QR code is ready");
  assert.equal(notice?.link, `/account/esims/numbers/${number._id}`);
  assert.equal(String(notice?.userId ?? notice?.user), String(shopper));
  const mail = await db.collection("emaildeliveries").findOne({ dedupeKey: `esim-number-qr-answer:${request._id}` });
  console.log(`✓ the shopper got a notice${mail ? " and an email" : " (email is not set up here, so no email)"}`);

  // 4. Answered once.
  assert.deepEqual(await answer(newLine), { ok: false, message: "This request is not waiting for a new code" });

  // 5. Declined: the shopper is told too.
  const second = await EsimNumberRequest.create({ kind: "qr", customer: shopper, key: `${tag}:qr2`, number: number._id, msisdn: MSISDN, feeMinor: 0, currency: "EUR", state: "pending", nextAttemptAt: new Date() });
  const declined = await rejectQrRequest("e2e", String(second._id), "The supplier has no profile for this number right now");
  assert.ok(declined.ok);
  const declinedNotice = await db.collection("notifications").findOne({ "data.key": `esim-number-qr-answer:${second._id}` });
  assert.equal(declinedNotice?.title, "Your new QR code request was declined");
  assert.match(String(declinedNotice?.message), /no profile for this number/);
  console.log("✓ a declined request is told to the shopper with the note");
  console.log("All new-card checks passed.");
}

async function cleanup() {
  const db = mongoose.connection.db!;
  const requests = await EsimNumberRequest.find({ key: new RegExp(`^${tag}:`) }).select({ _id: 1 }).lean();
  const keys = requests.map((row) => `esim-number-qr-answer:${row._id}`);
  await db.collection("notifications").deleteMany({ "data.key": { $in: keys } }).catch(() => undefined);
  await db.collection("emaildeliveries").deleteMany({ dedupeKey: { $in: keys } }).catch(() => undefined);
  await EsimNumberRequest.deleteMany({ key: new RegExp(`^${tag}:`) });
  await EsimNumber.deleteMany({ _id: { $in: created.numbers } });
  await User.collection.deleteMany({ _id: { $in: created.users } });
  if (created.provider) {
    await EsimProviderLog.deleteMany({ provider: created.provider });
    await EsimProvider.deleteOne({ _id: created.provider });
  } else {
    await EsimProviderLog.deleteMany({ "request.msisdn": { $in: [MSISDN, OTHER] } });
  }
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
