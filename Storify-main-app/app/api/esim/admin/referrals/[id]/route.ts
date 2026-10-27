import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { CommissionActionError, commissionAction } from "@/lib/esim/admin/referrals";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

const ActionSchema = z.object({ action: z.enum(["cancel", "settle"]), note: z.string().max(300).default("") });

/** Cancel a referral reward not paid yet, or record a claw-back as dealt with by hand. */
export const POST = withApi<{ id: string }>(ESIM_WRITE, async ({ request, params, session }) => {
  const body = await validateBody(request, ActionSchema);
  try {
    await commissionAction(params.id, body.action, body.note);
  } catch (error) {
    if (error instanceof CommissionActionError) throw new ValidationError(error.message);
    throw error;
  }
  await auditEsim(request, session, {
    resourceId: `esim:referral-commission:${params.id}`,
    resourceName: `eSIM referral reward ${params.id}`,
    summary: `Referral reward: ${body.action}`,
    after: { ...body },
  });
  return successResponse({ id: params.id });
});
