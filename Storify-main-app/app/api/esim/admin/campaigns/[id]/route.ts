import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { CampaignInputSchema } from "@/lib/esim/campaigns/rules";
import { CampaignError, deleteCampaign, saveCampaign } from "@/lib/esim/campaigns/service";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

const asValidation = (error: unknown): never => {
  if (error instanceof CampaignError) throw new ValidationError(error.message);
  throw error;
};

/** Change an eSIM campaign; its coupon follows (CAT-11). */
export const PUT = withApi<{ id: string }>(ESIM_WRITE, async ({ request, params, session }) => {
  const body = await validateBody(request, CampaignInputSchema);
  const campaign = await saveCampaign(body, { id: params.id, actor: session.user.email ?? session.user.id }).catch(asValidation);
  await auditEsim(request, session, {
    resourceId: `esim:campaign:${campaign.id}`,
    resourceName: `eSIM campaign ${campaign.name}`,
    summary: "Changed an eSIM campaign",
    after: { ...campaign },
  });
  return successResponse(campaign);
});

/** Remove an eSIM campaign; its coupon is switched off, not deleted. */
export const DELETE = withApi<{ id: string }>(ESIM_WRITE, async ({ request, params, session }) => {
  const campaign = await deleteCampaign(params.id).catch(asValidation);
  await auditEsim(request, session, {
    resourceId: `esim:campaign:${campaign.id}`,
    resourceName: `eSIM campaign ${campaign.name}`,
    summary: "Removed an eSIM campaign",
    before: { ...campaign },
  });
  return successResponse({ id: campaign.id });
});
