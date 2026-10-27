import "server-only";

import * as z from "zod";
import { connectDB, mongoose } from "@/lib/db";
import { User } from "@/models";
import { getEsimSettings } from "@/models/esim-pricing.model";
import { EsimKycSubmission, type KycStatus } from "@/models/esim-kyc.model";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { currentKycForm, kycStorageReady } from "@/lib/esim/kyc/service";
import type { KycField } from "@/lib/esim/kyc/rules";

/**
 * Admin → eSIM → KYC (KYC-01..03): submissions to review, the form, and which
 * plans need KYC — countries, supplier defaults and per-plan settings (the
 * plan library's bulk actions).
 */

export const KycRulesSchema = z.object({
  countries: z.array(z.string().regex(/^[A-Za-z]{2}$/)).max(250),
  suppliers: z.array(z.object({ code: z.string().min(1).max(40), required: z.boolean() })).max(50),
});

export const KycFormSchema = z.object({
  fields: z.array(z.object({
    key: z.string().max(40).optional(),
    label: z.string().max(120),
    type: z.enum(["text", "textarea", "select", "date", "file"]),
    required: z.boolean().default(false),
    options: z.array(z.string().max(100)).max(50).default([]),
    help: z.string().max(300).nullable().optional(),
  })).min(1).max(30),
});

export interface KycRules {
  countries: string[];
  suppliers: Array<{ code: string; name: string; required: boolean }>;
  planOverrides: { required: number; notRequired: number };
}

export async function getKycRules(): Promise<KycRules> {
  await connectDB();
  const [settings, providers, required, notRequired] = await Promise.all([
    getEsimSettings(),
    EsimProvider.find().select({ code: 1, name: 1, kycRequiredDefault: 1 }).sort({ code: 1 }).lean(),
    EsimPlan.countDocuments({ kycRequired: true }),
    EsimPlan.countDocuments({ kycRequired: false }),
  ]);
  return {
    countries: (settings.kyc?.countries ?? []).map((code) => code.toUpperCase()),
    suppliers: providers.filter((provider) => !provider.code.startsWith("fake")).map((provider) => ({ code: provider.code, name: provider.name, required: Boolean(provider.kycRequiredDefault) })),
    planOverrides: { required, notRequired },
  };
}

export async function saveKycRules(next: z.infer<typeof KycRulesSchema>) {
  const before = await getKycRules();
  const settings = await getEsimSettings();
  settings.kyc = { countries: [...new Set(next.countries.map((code) => code.toUpperCase()))].sort() };
  await settings.save();
  for (const supplier of next.suppliers) {
    await EsimProvider.updateOne({ code: supplier.code }, { $set: { kycRequiredDefault: supplier.required } });
  }
  return { before: { countries: before.countries, suppliers: before.suppliers }, after: next };
}

export type SubmissionView = KycStatus | "all";

export interface SubmissionRow {
  id: string;
  user: string | null;
  formVersion: number;
  status: KycStatus;
  reason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  answers: Array<{ label: string; type: string; value: string | null; file: { key: string; name: string; size: number } | null }>;
}

export async function listKycSubmissions(view: SubmissionView, options: { page?: number; search?: string } = {}) {
  await connectDB();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = 20;
  const match: Record<string, unknown> = view === "all" ? {} : { status: view };
  const search = options.search?.trim();
  if (search) {
    const users = await User.find({ email: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).select({ _id: 1 }).limit(50).lean();
    match.user = { $in: users.map((user) => user._id) };
  }
  const [rows, total, pending] = await Promise.all([
    // Waiting ones oldest first, so the queue is worked in order; the others newest first.
    EsimKycSubmission.find(match).sort(view === "pending" ? { createdAt: 1 } : { createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
    EsimKycSubmission.countDocuments(match),
    EsimKycSubmission.countDocuments({ status: "pending" }),
  ]);
  const users = await User.find({ _id: { $in: rows.map((row) => row.user) } }).select({ email: 1 }).lean<Array<{ _id: mongoose.Types.ObjectId; email?: string }>>();
  const email = new Map(users.map((user) => [String(user._id), user.email ?? null]));
  const iso = (value: Date | null | undefined) => (value ? new Date(value).toISOString() : null);
  return {
    rows: rows.map((row): SubmissionRow => ({
      id: String(row._id),
      user: email.get(String(row.user)) ?? null,
      formVersion: row.formVersion,
      status: row.status,
      reason: row.reason,
      reviewedBy: row.reviewedBy,
      reviewedAt: iso(row.reviewedAt),
      createdAt: iso(row.createdAt)!,
      answers: row.answers.map((answer) => ({ label: answer.label, type: answer.type, value: answer.value, file: answer.file ? { key: answer.file.key, name: answer.file.name, size: answer.file.size } : null })),
    })),
    pending,
    pagination: { page, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

export async function kycAdminOverview(view: SubmissionView, options: { page?: number; search?: string }) {
  const [list, form, rules, storageReady] = await Promise.all([listKycSubmissions(view, options), currentKycForm(), getKycRules(), kycStorageReady()]);
  return { list, form: form as { version: number; fields: KycField[] } | null, rules, storageReady };
}

