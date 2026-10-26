import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { refreshFx } from "@/lib/esim/admin/pricing";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

/** Pull today's ECB rates now and re-price the plans whose currency moved past the threshold (ADM-05). */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const result = await refreshFx();
  await auditEsim(request, session, {
    resourceId: "esim:fx",
    resourceName: "eSIM exchange rates",
    summary: `Refreshed exchange rates (${result.date}); ${result.repriced.changed} plans re-priced`,
  });
  return successResponse(result);
});
