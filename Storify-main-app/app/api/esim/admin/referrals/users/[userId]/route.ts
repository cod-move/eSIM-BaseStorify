import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { ReferralOverrideError, removeReferralOverride } from "@/lib/esim/admin/referrals";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

/** Put a referrer back on the store-wide referral rules (REF-07). */
export const DELETE = withApi<{ userId: string }>(ESIM_WRITE, async ({ request, params, session }) => {
  let removed;
  try {
    removed = await removeReferralOverride(params.userId);
  } catch (error) {
    if (error instanceof ReferralOverrideError) throw new ValidationError(error.message);
    throw error;
  }
  await auditEsim(request, session, {
    resourceId: `esim:referral-override:${params.userId}`,
    resourceName: `eSIM referral rules for ${params.userId}`,
    summary: "Put a referrer back on the store-wide referral rules",
    before: removed.before ?? undefined,
  });
  return successResponse({ userId: params.userId });
});
