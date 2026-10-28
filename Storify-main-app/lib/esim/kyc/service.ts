import "server-only";

import { connectDB, mongoose } from "@/lib/db";
import { User } from "@/models";
import { NotificationType } from "@/models/notification.model";
import { getEsimSettings } from "@/models/esim-pricing.model";
import { EsimKycForm, EsimKycSubmission, EsimKycUpload, type IEsimKycSubmission, type KycStatus } from "@/models/esim-kyc.model";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProductLink } from "@/models/esim-product-link.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { getStorageConfig, getStorageService, validateUpload } from "@/lib/storage";
import { BIZ_PRIVATE_UPLOAD_PREFIX } from "@/lib/storage/private-prefixes";
import { isStorageConfigured } from "@/lib/storage/storage-readiness";
import type { StorageService } from "@/lib/storage";
import { createNotification } from "@/lib/notifications/notifications";
import { sendEmail } from "@/lib/email/email";
import { escapeHtml } from "@/lib/email/escape-html";
import { appBaseUrl } from "@/lib/app-url";
import { checkAnswers, kycRequiredFor, normalizeForm, type KycField } from "@/lib/esim/kyc/rules";

/**
 * Customer KYC (KYC-01..03): the published form, a shopper's submission with
 * their files in private storage, the review, and which plans need it.
 */

export const KYC_FILE_PREFIX = `${BIZ_PRIVATE_UPLOAD_PREFIX}esim-kyc/`;

/** A key inside the KYC folder with no empty, "." or ".." segment — what the download routes accept. */
export function isKycFileKey(key: string): boolean {
  if (!key.startsWith(KYC_FILE_PREFIX) || key.length > 1024 || key.includes("\\")) return false;
  return key.slice(KYC_FILE_PREFIX.length).split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/** Whether private uploads can be stored (Storify's own readiness rule): without it, file fields cannot be answered. */
export async function kycStorageReady(): Promise<boolean> {
  try {
    const config = await getStorageConfig();
    return isStorageConfigured(String(config.provider), (field) => Boolean((config as unknown as Record<string, unknown>)[field]));
  } catch {
    return false;
  }
}

/** Private storage as KYC uses it; a test passes its own. */
export type KycStorage = Pick<StorageService, "uploadPrivateFile" | "deletePrivateFile">;

export class KycError extends Error {
  constructor(message: string, readonly fieldErrors: Record<string, string> = {}) {
    super(message);
  }
}

export async function currentKycForm(): Promise<{ version: number; fields: KycField[] } | null> {
  await connectDB();
  const form = await EsimKycForm.findOne().sort({ version: -1 }).lean();
  return form ? { version: form.version, fields: form.fields as KycField[] } : null;
}

/** Publishes the fields as the next version; earlier versions stay as they were. */
export async function publishKycForm(fields: ReadonlyArray<Partial<KycField>>, actor: string) {
  const normalized = normalizeForm(fields);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const latest = await EsimKycForm.findOne().sort({ version: -1 }).select({ version: 1 }).lean();
    try {
      const form = await EsimKycForm.create({ version: (latest?.version ?? 0) + 1, fields: normalized, publishedBy: actor });
      return { version: form.version, fields: normalized };
    } catch (error) {
      if ((error as { code?: number })?.code !== 11000) throw error;
    }
  }
  throw new KycError("Another admin published at the same time; try again");
}

export interface KycState {
  status: KycStatus | "none";
  reason: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
}

export async function kycState(userId: string): Promise<KycState> {
  if (!mongoose.isValidObjectId(userId)) return { status: "none", reason: null, submittedAt: null, reviewedAt: null };
  const latest = await EsimKycSubmission.findOne({ user: userId }).sort({ createdAt: -1 }).select({ status: 1, reason: 1, createdAt: 1, reviewedAt: 1 }).lean();
  if (!latest) return { status: "none", reason: null, submittedAt: null, reviewedAt: null };
  return { status: latest.status, reason: latest.reason, submittedAt: latest.createdAt, reviewedAt: latest.reviewedAt };
}

/**
 * A shopper's answers and files to the current form. Refused while one waits
 * for review or after approval (approved shoppers never submit again); files
 * go to private storage under the shopper's own folder.
 */
export async function submitKyc(
  userId: string,
  values: Record<string, unknown>,
  files: Record<string, File | undefined>,
  options: { storage?: KycStorage; staged?: Record<string, string> } = {},
) {
  const form = await currentKycForm();
  if (!form) throw new KycError("Identity verification is not open yet");
  const state = await kycState(userId);
  if (state.status === "pending") throw new KycError("Your details are already waiting for review");
  if (state.status === "approved") throw new KycError("Your identity is already verified");
  const uploads = Object.fromEntries(Object.entries(files).filter(([, file]) => file && file.size > 0).map(([key, file]) => [key, { name: file!.name, mime: file!.type || "application/octet-stream", size: file!.size }]));
  // Documents the shopper app stored first (stageKycFile), named by the submission: this shopper's, for that field.
  const staged = await stagedUploads(userId, options.staged ?? {});
  for (const [key, upload] of Object.entries(staged)) uploads[key] ??= { name: upload.name, mime: upload.mime, size: upload.size };
  const checked = checkAnswers(form.fields, values, uploads);
  if (!checked.ok) throw new KycError("Some answers need another look", checked.errors);

  const withFiles = form.fields.some((field) => field.type === "file" && files[field.key]?.size);
  if (withFiles && !options.storage && !(await kycStorageReady())) {
    throw new KycError("Uploading documents is not set up for this store yet. Please try again later.");
  }
  const storage: KycStorage | null = withFiles ? options.storage ?? (await getStorageService()) : null;
  const config = withFiles ? await getStorageConfig() : null;
  const stored: Record<string, { key: string; name: string; mime: string; size: number }> = Object.fromEntries(
    Object.entries(staged).filter(([key]) => !files[key]?.size).map(([key, upload]) => [key, { key: upload.key, name: upload.name, mime: upload.mime, size: upload.size }]),
  );
  for (const field of form.fields.filter((entry) => entry.type === "file")) {
    const file = files[field.key];
    if (!file || !file.size || !storage || !config) continue;
    const allowed = validateUpload(config, file.size, file.type);
    if (!allowed.valid) throw new KycError(allowed.error || "That file cannot be uploaded", { [field.key]: allowed.error || "Upload refused" });
    const result = await storage.uploadPrivateFile(Buffer.from(await file.arrayBuffer()), {
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size,
      customPath: `${KYC_FILE_PREFIX}${userId}/`,
      metadata: { uploadedBy: userId, purpose: "esim-kyc", field: field.key },
    });
    stored[field.key] = { key: result.key, name: file.name, mime: file.type, size: file.size };
  }

  try {
    const submission = await EsimKycSubmission.create({
      user: new mongoose.Types.ObjectId(userId),
      formVersion: form.version,
      answers: form.fields.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        value: field.type === "file" ? null : checked.values[field.key] ?? null,
        file: stored[field.key] ?? null,
      })),
    });
    await EsimKycUpload.deleteMany({ _id: { $in: Object.values(staged).map((upload) => upload._id) } }).catch(() => undefined);
    return { id: String(submission._id) };
  } catch (error) {
    // Lost a race with another submission of the same shopper: its files go (staged ones stay for a retry).
    const stagedKeys = new Set(Object.values(staged).map((upload) => upload.key));
    for (const file of Object.values(stored)) if (!stagedKeys.has(file.key)) await storage?.deletePrivateFile(file.key).catch(() => undefined);
    if ((error as { code?: number })?.code === 11000) throw new KycError("Your details are already waiting for review");
    throw error;
  }
}

/**
 * Documents staged by the shopper app and never sent (stageKycFile): the
 * file is deleted from private storage, then its record. Run with the usage
 * cron. Never throws for one file; the next run tries again.
 */
export async function sweepKycUploads(now = new Date(), options: { storage?: KycStorage } = {}) {
  await connectDB();
  const stale = await EsimKycUpload.find({ createdAt: { $lt: new Date(now.getTime() - 86_400_000) } }).limit(200).lean();
  if (!stale.length) return { deleted: 0 };
  const storage = options.storage ?? (await getStorageService());
  let deleted = 0;
  for (const upload of stale) {
    try {
      if (isKycFileKey(upload.key)) await storage.deletePrivateFile(upload.key);
      await EsimKycUpload.deleteOne({ _id: upload._id });
      deleted++;
    } catch (error) {
      console.error(`Deleting a staged KYC document failed (${String(upload._id)}):`, error);
    }
  }
  return { deleted };
}

async function stagedUploads(userId: string, staged: Record<string, string>) {
  const ids = Object.values(staged).filter((id) => mongoose.isValidObjectId(id));
  if (!ids.length) return {} as Record<string, { _id: mongoose.Types.ObjectId; key: string; name: string; mime: string; size: number }>;
  const rows = await EsimKycUpload.find({ _id: { $in: ids }, user: userId }).lean();
  const byId = new Map(rows.map((row) => [String(row._id), row]));
  const found: Record<string, { _id: mongoose.Types.ObjectId; key: string; name: string; mime: string; size: number }> = {};
  for (const [field, id] of Object.entries(staged)) {
    const row = byId.get(id);
    if (row && row.field === field && isKycFileKey(row.key)) found[field] = { _id: row._id as mongoose.Types.ObjectId, key: row.key, name: row.name, mime: row.mime, size: row.size };
  }
  return found;
}

/**
 * One document for a file question of the current form, stored privately
 * under the shopper's folder before the form is sent (the shopper app sends
 * one file per request). The answer is the id the submission names.
 */
export async function stageKycFile(userId: string, fieldKey: string, file: File, options: { storage?: KycStorage } = {}) {
  const form = await currentKycForm();
  if (!form) throw new KycError("Identity verification is not open yet");
  const field = form.fields.find((entry) => entry.key === fieldKey && entry.type === "file");
  if (!field) throw new KycError("That question does not take a file", { [fieldKey]: "Not a file question" });
  const state = await kycState(userId);
  if (state.status === "pending" || state.status === "approved") throw new KycError("Your details cannot be changed now");
  if (!options.storage && !(await kycStorageReady())) {
    throw new KycError("Uploading documents is not set up for this store yet. Please try again later.");
  }
  const config = await getStorageConfig();
  const checked = checkAnswers([{ ...field, required: true }], {}, { [field.key]: { name: file.name, mime: file.type || "application/octet-stream", size: file.size } });
  if (!checked.ok) throw new KycError(checked.errors[field.key] ?? "That file cannot be uploaded", checked.errors);
  const allowed = validateUpload(config, file.size, file.type);
  if (!allowed.valid) throw new KycError(allowed.error || "That file cannot be uploaded", { [field.key]: allowed.error || "Upload refused" });
  const storage = options.storage ?? (await getStorageService());
  const result = await storage.uploadPrivateFile(Buffer.from(await file.arrayBuffer()), {
    fileName: file.name,
    contentType: file.type,
    fileSize: file.size,
    customPath: `${KYC_FILE_PREFIX}${userId}/`,
    metadata: { uploadedBy: userId, purpose: "esim-kyc", field: field.key },
  });
  // One staged document per question: the one it replaces goes, file first.
  for (const previous of await EsimKycUpload.find({ user: userId, field: field.key }).lean()) {
    await storage.deletePrivateFile(previous.key).catch(() => undefined);
    await EsimKycUpload.deleteOne({ _id: previous._id });
  }
  const upload = await EsimKycUpload.create({ user: new mongoose.Types.ObjectId(userId), field: field.key, key: result.key, name: file.name, mime: file.type, size: file.size });
  return { id: String(upload._id), name: file.name };
}

async function tellShopper(submission: IEsimKycSubmission) {
  const userId = String(submission.user);
  const approved = submission.status === "approved";
  const title = approved ? "Identity verified" : "Identity check not passed";
  const message = approved
    ? "Your identity is verified. You can now buy eSIMs that need it."
    : `We could not verify your identity: ${submission.reason ?? "see your account"}. You can send your details again.`;
  await createNotification({
    userId,
    type: NotificationType.SYSTEM,
    title,
    message,
    link: "/account/esims/verification",
    data: { esimKyc: String(submission._id), status: submission.status },
    dedupe: { "data.esimKyc": String(submission._id), "data.status": submission.status },
  }).catch(console.error);
  const user = await User.findById(userId).select({ email: 1 }).lean<{ email?: string } | null>();
  if (user?.email) {
    await sendEmail({
      to: user.email,
      subject: title,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p><p><a href="${escapeHtml(`${appBaseUrl()}/account/esims/verification`)}">Open my account</a></p></div>`,
      category: "esim-kyc",
      dedupeKey: `esim-kyc:${submission._id}:${submission.status}`,
    }).catch(console.error);
  }
}

/** Approves or rejects a waiting submission; a rejection needs a reason. The shopper is told either way. */
export async function reviewKyc(submissionId: string, decision: "approved" | "rejected", reason: string, actor: string) {
  if (!mongoose.isValidObjectId(submissionId)) throw new KycError("Unknown submission");
  if (decision === "rejected" && !reason.trim()) throw new KycError("Say why it was rejected");
  const updated = await EsimKycSubmission.findOneAndUpdate(
    { _id: submissionId, status: "pending" },
    { $set: { status: decision, reason: decision === "rejected" ? reason.trim().slice(0, 500) : null, reviewedBy: actor, reviewedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) throw new KycError("This submission was already reviewed");
  await tellShopper(updated);
  return { id: submissionId, status: decision };
}

export async function kycCountries(): Promise<string[]> {
  return ((await getEsimSettings()).kyc?.countries ?? []).map((code) => code.toUpperCase());
}

/**
 * The eSIM variants among these ids that need KYC: any of their supplier
 * candidates does (the order may be filled by any of them).
 */
export async function variantsNeedingKyc(variantIds: unknown[]): Promise<Set<string>> {
  const ids = [...new Set(variantIds.filter(Boolean).map(String))].filter((id) => mongoose.isValidObjectId(id));
  const needing = new Set<string>();
  if (!ids.length) return needing;
  const links = await EsimProductLink.find({ "variants.variantId": { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } }).select({ variants: 1 }).lean();
  const wanted = new Set(ids);
  const variants = links.flatMap((link) => link.variants).filter((variant) => wanted.has(String(variant.variantId)));
  if (!variants.length) return needing;
  const plans = await EsimPlan.find({ _id: { $in: variants.flatMap((variant) => variant.candidates) } }).select({ kycRequired: 1, providerCode: 1, "coverage.countries": 1 }).lean();
  const providers = new Map((await EsimProvider.find({ code: { $in: [...new Set(plans.map((plan) => plan.providerCode))] } }).select({ code: 1, kycRequiredDefault: 1 }).lean()).map((provider) => [provider.code, Boolean(provider.kycRequiredDefault)]));
  const countries = await kycCountries();
  const planNeeds = new Map(plans.map((plan) => [String(plan._id), kycRequiredFor({ kycRequired: plan.kycRequired ?? null, countryCodes: plan.coverage.countries.map((country) => country.code) }, providers.get(plan.providerCode) ?? false, countries)]));
  for (const variant of variants) {
    if (variant.candidates.some((candidate) => planNeeds.get(String(candidate)))) needing.add(String(variant.variantId));
  }
  return needing;
}
