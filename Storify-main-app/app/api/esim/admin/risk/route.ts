import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { validateBody } from "@/lib/api/validate";
import { RiskSettingsSchema, saveRiskSettings } from "@/lib/esim/admin/risk";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

/** Save the order review settings (ORD-13). */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const body = await validateBody(request, RiskSettingsSchema);
  const { before, after } = await saveRiskSettings(body);
  await auditEsim(request, session, {
    resourceId: "esim:risk",
    resourceName: "eSIM order review",
    summary: "Changed the eSIM order review settings",
    before: { ...before },
    after: { ...after },
  });
  return successResponse(after);
});
