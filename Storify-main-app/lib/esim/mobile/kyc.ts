import * as z from "zod";
import { EsimKyc, EsimKycFile, EsimKycSubmitRequest } from "@/contracts/mobile/shop/v1/esim";
import { MobileApiError } from "@/lib/api-core/errors";
import { defineRoute } from "@/lib/api-core/registry";
import { connectDB } from "@/lib/db";
import { KYC_FILE_MAX_MB, KYC_FILE_TYPES } from "@/lib/esim/kyc/rules";
import { KycError, currentKycForm, kycState, kycStorageReady, stageKycFile, submitKyc } from "@/lib/esim/kyc/service";

/**
 * The shopper app's identity verification (APP-07): the website's own form,
 * state and submission (lib/esim/kyc/service.ts), the files staged one per
 * request (`stageKycFile`) because the app sends one file at a time.
 */

const MAX_FILE_BYTES = KYC_FILE_MAX_MB * 1024 * 1024;
const iso = (date: Date | null | undefined) => (date ? new Date(date).toISOString() : undefined);

function refusal(error: KycError): MobileApiError {
  const errors = Object.fromEntries(Object.entries(error.fieldErrors).map(([key, message]) => [key, [message]]));
  return new MobileApiError(422, "VALIDATION_ERROR", error.message, Object.keys(errors).length ? { errors } : {});
}

/** GET /me/esim-kyc */
export const esimKycRoute = defineRoute({
  id: "me.esimKyc.get",
  method: "GET",
  path: "/me/esim-kyc",
  auth: "user",
  cache: { kind: "private" },
  output: EsimKyc,
  handler: async ({ session }) => {
    await connectDB();
    return kycView(session.user.id);
  },
});

/** Where the shopper stands, and the form. */
async function kycView(userId: string) {
  const [state, form, uploadsReady] = await Promise.all([kycState(userId), currentKycForm(), kycStorageReady()]);
  return {
    status: state.status,
    ...(state.reason ? { reason: state.reason } : {}),
    ...(state.submittedAt ? { submittedAt: iso(state.submittedAt) } : {}),
    ...(form
      ? {
          form: {
            version: form.version,
            fields: form.fields.map((field) => ({
              key: field.key,
              label: field.label,
              type: field.type,
              required: field.required,
              options: field.options,
              ...(field.help ? { help: field.help } : {}),
            })),
          },
        }
      : {}),
    uploadsReady,
    fileTypes: [...KYC_FILE_TYPES],
    maxFileBytes: MAX_FILE_BYTES,
  };
}

const FileForm = z.object({ file: z.unknown(), field: z.string().min(1).max(64) });

/** POST /me/esim-kyc/files: one document, stored privately until the form names it. */
export const esimKycFileRoute = defineRoute({
  id: "me.esimKyc.file",
  method: "POST",
  path: "/me/esim-kyc/files",
  auth: "user",
  cache: { kind: "private" },
  status: 201,
  rateLimit: { bucket: "upload:esim-kyc", preset: "moderate" },
  demo: "block-mutations",
  form: { maxBytes: MAX_FILE_BYTES + 512 * 1024, files: ["file"] },
  input: FileForm,
  output: EsimKycFile,
  handler: async ({ session, input }) => {
    await connectDB();
    if (!(input.file instanceof File) || input.file.size === 0) {
      throw new MobileApiError(400, "VALIDATION_ERROR", "Add a file", { errors: { [input.field]: ["Add a file"] } });
    }
    try {
      return await stageKycFile(session.user.id, input.field, input.file);
    } catch (error) {
      if (error instanceof KycError) throw refusal(error);
      throw error;
    }
  },
});

/** POST /me/esim-kyc: the answers, and the documents by the ids they were stored under. */
export const esimKycSubmitRoute = defineRoute({
  id: "me.esimKyc.submit",
  method: "POST",
  path: "/me/esim-kyc",
  auth: "user",
  cache: { kind: "private" },
  status: 201,
  rateLimit: { bucket: "esim:kyc:submit", preset: "strict" },
  demo: "block-mutations",
  input: EsimKycSubmitRequest,
  output: EsimKyc,
  handler: async ({ session, input }) => {
    await connectDB();
    try {
      await submitKyc(session.user.id, input.values, {}, { staged: input.files });
    } catch (error) {
      if (error instanceof KycError) throw refusal(error);
      throw error;
    }
    return kycView(session.user.id);
  },
});
