import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { KycError, currentKycForm, kycState, submitKyc } from "@/lib/esim/kyc/service";

/** The shopper's verification status and the form to fill in (KYC-02). */
export const GET = withApi(
  { auth: "user", rateLimit: { action: "esim:kyc:read", preset: "lenient" } },
  async ({ session }) => successResponse({ state: await kycState(session.user.id), form: await currentKycForm() }),
);

/** The shopper sends their answers and files (multipart form data, one part per field). */
export const POST = withApi(
  { auth: "user", rateLimit: { action: "esim:kyc:submit", preset: "strict" } },
  async ({ request, session }) => {
    const data = await request.formData();
    const values: Record<string, unknown> = {};
    const files: Record<string, File> = {};
    for (const [key, value] of data.entries()) {
      if (value instanceof File) files[key] = value;
      else values[key] = value;
    }
    try {
      return successResponse(await submitKyc(session.user.id, values, files));
    } catch (error) {
      if (error instanceof KycError) {
        throw new ValidationError(Object.keys(error.fieldErrors).length ? Object.fromEntries(Object.entries(error.fieldErrors).map(([key, message]) => [key, [message]])) : error.message);
      }
      throw error;
    }
  },
);
