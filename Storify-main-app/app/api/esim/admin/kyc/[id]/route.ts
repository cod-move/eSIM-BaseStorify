import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { KycError, reviewKyc } from "@/lib/esim/kyc/service";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

const ReviewSchema = z.object({ decision: z.enum(["approved", "rejected"]), reason: z.string().max(500).default("") });

/** Approve or reject a KYC submission; a rejection needs a reason. The shopper is told. */
export const POST = withApi<{ id: string }>(ESIM_WRITE, async ({ request, params, session }) => {
  const body = await validateBody(request, ReviewSchema);
  try {
    const result = await reviewKyc(params.id, body.decision, body.reason, session.user.email ?? session.user.id);
    await auditEsim(request, session, {
      resourceId: `esim:kyc:${params.id}`,
      resourceName: `eSIM KYC submission ${params.id}`,
      summary: `KYC ${body.decision}`,
      after: { decision: body.decision, reason: body.reason || null },
    });
    return successResponse(result);
  } catch (error) {
    if (error instanceof KycError) throw new ValidationError(error.message);
    throw error;
  }
});
