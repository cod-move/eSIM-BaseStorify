import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { CampaignInputSchema } from "@/lib/esim/campaigns/rules";
import { CampaignError, saveCampaign } from "@/lib/esim/campaigns/service";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

/** Create an eSIM campaign and its coupon (CAT-11). */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const body = await validateBody(request, CampaignInputSchema);
  let campaign;
  try {
    campaign = await saveCampaign(body, { actor: session.user.email ?? session.user.id });
  } catch (error) {
    if (error instanceof CampaignError) throw new ValidationError(error.message);
    throw error;
  }
  await auditEsim(request, session, {
    resourceId: `esim:campaign:${campaign.id}`,
    resourceName: `eSIM campaign ${campaign.name}`,
    summary: "Created an eSIM campaign",
    after: { ...campaign },
  });
  return successResponse(campaign);
});
