import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { ReferralOverrideError, ReferralOverrideSchema, saveReferralOverride } from "@/lib/esim/admin/referrals";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

/** Give one referrer rules of their own (REF-07); fields left null follow the store-wide settings. */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const body = await validateBody(request, ReferralOverrideSchema);
  let saved;
  try {
    saved = await saveReferralOverride(body, session?.user?.email ?? session?.user?.id ?? null);
  } catch (error) {
    if (error instanceof ReferralOverrideError) throw new ValidationError(error.message);
    throw error;
  }
  await auditEsim(request, session, {
    resourceId: `esim:referral-override:${saved.userId}`,
    resourceName: `eSIM referral rules for ${body.email}`,
    summary: saved.before ? "Changed a referrer's own referral rules" : "Gave a referrer referral rules of their own",
    before: saved.before ?? undefined,
    after: { ...saved.after },
  });
  return successResponse({ userId: saved.userId });
});
