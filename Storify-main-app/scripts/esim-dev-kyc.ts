/**
 * End-to-end check of customer KYC (KYC-01..03) against a development
 * database, with a fake supplier — nothing is bought.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-kyc.ts
 *
 * Publishes a plan that needs KYC, checks the cart and checkout gate, publishes
 * a form, submits it with a file (to private storage), rejects, resubmits and
 * approves it, and checks checkout opens. Removes everything it created —
 * files, form versions, the product — and reports any collection whose
 * document count changed. Refuses to run with NODE_ENV=production.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { Cart, Product, User } from "@/models";
import { EsimKycForm, EsimKycSubmission, EsimKycUpload } from "@/models/esim-kyc.model";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProductLink } from "@/models/esim-product-link.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { keepTopupProductAsItWas } from "./lib/esim-topup-product";

const tag = `e2e-kyc-${Date.now()}`;
const slug = `${tag}-china`;
type Id = mongoose.Types.ObjectId;
const created = { provider: null as Id | null, users: [] as Id[], product: null as Id | null, formVersionsAbove: 0 };
/** Private storage stand-in: the dev store may have none configured, and nothing should be left in a real one. */
const files = new Map<string, number>();
const storage = {
  async uploadPrivateFile(file: Buffer, options: { customPath?: string; fileName: string }) {
    const key = `${options.customPath}${Date.now()}-${files.size}/${options.fileName}`;
    files.set(key, file.length);
    return { success: true, key, url: "" } as never;
  },
  async deletePrivateFile(key: string) {
    files.delete(key);
    return { success: true } as never;
  },
};

async function counts() {
  const db = mongoose.connection.db!;
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  return new Map(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const)));
}

async function refusedWith(run: () => Promise<unknown>, pattern: RegExp) {
  await assert.rejects(run, (error: Error & { errors?: Record<string, string[]>; fieldErrors?: Record<string, string> }) => {
    assert.match([error.message, ...Object.values(error.errors ?? {}).flat(), ...Object.values(error.fieldErrors ?? {})].join(" "), pattern);
    return true;
  });
}

async function run() {
  const kyc = await import("@/lib/esim/kyc/service");
  const { listKycSubmissions } = await import("@/lib/esim/admin/kyc");
  const { publishProducts } = await import("@/lib/esim/catalog/publish");
  const { addCartLine } = await import("@/lib/cart/cart-service");
  const { esimLinePrices } = await import("@/lib/esim/cart");

  created.formVersionsAbove = (await EsimKycForm.findOne().sort({ version: -1 }).lean())?.version ?? 0;
  let provider = await EsimProvider.findOne({ code: "fake-fulfil" });
  if (!provider) {
    provider = await new EsimProvider({ code: "fake-fulfil", name: "Fake fulfil", status: "active", settlementCurrency: "USD", credentials: { mode: "fulfil" } }).save();
    created.provider = provider._id as Id;
  }
  await new EsimPlan({
    provider: provider._id, providerCode: "fake-fulfil", providerPlanId: tag, name: "China 5GB 30Days", slug: tag, productSlug: slug, destination: `China ${tag}`,
    coverage: { scope: "local", countries: [{ code: "CN", name: "China" }], networks: [], breakoutIp: [] },
    data: { megabytes: 5120, label: "5GB", type: "total" }, validityDays: 30,
    duration: { configurable: false, defaultDays: 30, minDays: 30, maxDays: 30 },
    activation: { billingStarts: "first_connection", preInstallDays: 180 }, topup: { supported: false },
    cost: { currency: "USD", amountMinor: 300, billingUnit: "plan" }, syncedAt: new Date(), contentHash: tag,
    status: "active", available: true, retailPriceMinor: 699, kycRequired: true,
  }).save();
  await publishProducts({ productSlugs: [slug], status: "active" });
  const link = await EsimProductLink.findOne({ productSlug: slug }).lean();
  created.product = link!.product as Id;
  const variantId = String(link!.variants[0].variantId);
  const line = { productId: String(link!.product), variantId, quantity: 1 };

  const { insertedId } = await User.collection.insertOne({ email: `${tag}@esim.test`, name: "E2E", role: "customer", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
  created.users.push(insertedId as Id);
  const userId = String(insertedId);

  // 1. The gate.
  assert.ok((await kyc.variantsNeedingKyc([variantId])).has(variantId));
  await refusedWith(() => addCartLine({ sessionId: tag }, line), /Sign in to buy this eSIM/);
  await addCartLine({ userId }, line);
  const stored = (await Cart.findOne({ userId }).lean<{ items: Array<Record<string, unknown>> }>())!.items[0];
  await refusedWith(() => esimLinePrices([{ ...stored }], { userId }), /needs identity verification/);
  await refusedWith(() => esimLinePrices([{ ...stored }], {}), /sign in and verify/);
  console.log("✓ gate: a guest cannot add it; a shopper not verified cannot check out");

  // 2. The form, a submission with a file, a rejection, a resubmission, approval.
  await refusedWith(() => kyc.publishKycForm([{ label: "Pick", type: "select", options: ["one"] }], tag), /two choices/);
  const form = await kyc.publishKycForm([
    { label: "Full name", type: "text", required: true },
    { label: "ID type", type: "select", required: true, options: ["Passport", "ID card"] },
    { label: "ID photo", type: "file", required: true },
  ], tag);
  assert.equal(form.version, created.formVersionsAbove + 1);
  const photo = () => new File([Buffer.from("89504e470d0a1a0a", "hex")], "id.png", { type: "image/png" });
  await refusedWith(() => kyc.submitKyc(userId, { full_name: "Ada" }, {}, { storage }), /Choose one|required|Add a file/);
  if (!(await kyc.kycStorageReady())) {
    await refusedWith(() => kyc.submitKyc(userId, { full_name: "Ada Lovelace", id_type: "Passport" }, { id_photo: photo() }), /not set up/);
    console.log("✓ no file storage configured here: a document upload is refused with a clear message");
  }
  const first = await kyc.submitKyc(userId, { full_name: "Ada Lovelace", id_type: "Passport" }, { id_photo: photo() }, { storage });
  assert.equal((await kyc.kycState(userId)).status, "pending");
  await refusedWith(() => kyc.submitKyc(userId, { full_name: "Ada", id_type: "Passport" }, { id_photo: photo() }, { storage }), /already waiting/);
  const submission = await EsimKycSubmission.findById(first.id).lean();
  const fileKey = submission!.answers.find((answer) => answer.key === "id_photo")!.file!.key;
  assert.ok(kyc.isKycFileKey(fileKey), `stored privately under the KYC folder: ${fileKey}`);
  assert.equal(kyc.isKycFileKey(`${kyc.KYC_FILE_PREFIX}../vendor-documents/x.pdf`), false);
  assert.equal((await listKycSubmissions("pending", { search: tag })).rows.length, 1);
  await refusedWith(() => kyc.reviewKyc(first.id, "rejected", " ", tag), /Say why/);
  await kyc.reviewKyc(first.id, "rejected", "The photo is blurred", tag);
  await refusedWith(() => kyc.reviewKyc(first.id, "approved", "", tag), /already reviewed/);
  assert.deepEqual([(await kyc.kycState(userId)).status, (await kyc.kycState(userId)).reason], ["rejected", "The photo is blurred"]);
  assert.equal(files.size, 1, "one document stored");
  // One staged document per question: a new one replaces the last, file included.
  const before = files.size;
  const replaced = await kyc.stageKycFile(userId, "id_photo", photo(), { storage });
  const old = await kyc.stageKycFile(userId, "id_photo", photo(), { storage });
  assert.equal(files.size, before + 1, "the replaced document is deleted");
  assert.equal(await EsimKycUpload.countDocuments({ _id: replaced.id }), 0);
  // Staged and never sent: the sweep deletes the file, then the record.
  await EsimKycUpload.collection.updateOne({ _id: new mongoose.Types.ObjectId(old.id) }, { $set: { createdAt: new Date(Date.now() - 2 * 86_400_000) } });
  assert.deepEqual(await kyc.sweepKycUploads(new Date(), { storage }), { deleted: 1 });
  assert.equal(files.size, before, "the old file is gone");
  assert.equal(await kyc.sweepKycUploads(new Date(), { storage }).then((result) => result.deleted), 0, "nothing left to sweep");
  console.log("✓ staging: one document per question (a new one replaces the last); one never sent is swept after a day, file and record");

  // The shopper app's way: the document stored first, the form naming it.
  await refusedWith(() => kyc.stageKycFile(userId, "full_name", photo(), { storage }), /does not take a file/);
  const staged = await kyc.stageKycFile(userId, "id_photo", photo(), { storage });
  await refusedWith(
    () => kyc.submitKyc(userId, { full_name: "Ada Lovelace", id_type: "Passport" }, {}, { storage, staged: { id_photo: "64b000000000000000000000" } }),
    /Add a file/,
  );
  const second = await kyc.submitKyc(userId, { full_name: "Ada Lovelace", id_type: "Passport" }, {}, { storage, staged: { id_photo: staged.id } });
  const secondFile = (await EsimKycSubmission.findById(second.id).lean())!.answers.find((answer) => answer.key === "id_photo")!.file!;
  assert.ok(kyc.isKycFileKey(secondFile.key), "the staged document, under the KYC folder");
  assert.equal(await EsimKycUpload.countDocuments({ _id: staged.id }), 0, "the staged record is used up");
  console.log("✓ app upload: a document staged first and named by the form; an unknown id and a text question refused");

  await kyc.reviewKyc(second.id, "approved", "", tag);
  assert.equal((await kyc.kycState(userId)).status, "approved");
  await refusedWith(() => kyc.submitKyc(userId, { full_name: "Ada", id_type: "Passport" }, { id_photo: photo() }, { storage }), /already verified/);
  console.log("✓ KYC: form published (v" + form.version + "), file stored privately, rejected with a reason, resubmitted, approved");

  // 3. Checkout opens.
  const prices = await esimLinePrices([{ ...stored }], { userId });
  assert.equal(prices.size, 0, "an ordinary fixed plan, priced by Storify as usual");
  console.log("✓ verified: checkout goes through");
  console.log("All KYC checks passed.");
}

async function cleanup() {
  const db = mongoose.connection.db!;
  const users = [...created.users, ...created.users.map(String)];
  for (const submission of await EsimKycSubmission.find({ user: { $in: created.users } }).lean()) {
    for (const answer of submission.answers) if (answer.file?.key) await storage.deletePrivateFile(answer.file.key).catch(() => undefined);
  }
  await EsimKycSubmission.deleteMany({ user: { $in: created.users } });
  for (const upload of await EsimKycUpload.find({ user: { $in: created.users } }).lean()) await storage.deletePrivateFile(upload.key).catch(() => undefined);
  await EsimKycUpload.deleteMany({ user: { $in: created.users } });
  await EsimKycForm.deleteMany({ version: { $gt: created.formVersionsAbove } });
  await db.collection("notifications").deleteMany({ userId: { $in: users } }).catch(() => undefined);
  await db.collection("emailjobs").deleteMany({ to: new RegExp(tag) }).catch(() => undefined);
  await Cart.collection.deleteMany({ $or: [{ userId: { $in: users } }, { sessionId: tag }] });
  if (created.product) {
    const productId = created.product;
    for (const name of ["audit_logs", "inventorymovements", "inventory_movements", "metacatalogsyncs", "productsearches", "stockmovements"]) {
      await db.collection(name).deleteMany({ $or: [{ productId }, { productId: String(productId) }, { resourceId: String(productId) }, { sourceId: String(productId) }] }).catch(() => undefined);
    }
    await Product.collection.deleteOne({ _id: productId });
  }
  await EsimProductLink.deleteMany({ productSlug: slug });
  await db.collection("esimdestinations").deleteMany({ productSlug: slug });
  await EsimPlan.deleteMany({ productSlug: slug });
  await User.collection.deleteMany({ _id: { $in: created.users } });
  if (created.provider) await EsimProvider.deleteOne({ _id: created.provider });
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against production");
  process.env.ESIM_ENABLE_FAKE_PROVIDER = "true";
  await connectDB();
  const before = await counts();
  const restoreProducts = await keepTopupProductAsItWas();
  try {
    await run();
  } finally {
    await cleanup().catch((error) => console.error("cleanup failed:", error));
    await restoreProducts().catch((error) => console.error("product cleanup failed:", error));
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
