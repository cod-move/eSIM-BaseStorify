import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { validateBody } from "@/lib/api/validate";
import { ReferralSettingsSchema, saveReferralSettings } from "@/lib/esim/admin/referrals";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

/** Save the referral settings: rewards, their limits, the holding period and the welcome coupon. */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const body = await validateBody(request, ReferralSettingsSchema);
  const { before, after } = await saveReferralSettings(body);
  await auditEsim(request, session, {
    resourceId: "esim:referrals",
    resourceName: "eSIM referrals",
    summary: "Changed the referral settings",
    before: { ...before },
    after: { ...after },
  });
  return successResponse(after);
});
