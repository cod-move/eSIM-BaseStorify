import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { validateBody } from "@/lib/api/validate";
import { NumberSettingsSchema, saveNumberSettings } from "@/lib/esim/numbers/settings";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

/** Save the number-card settings (NUM-04/08): the smallest recharge. */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const body = await validateBody(request, NumberSettingsSchema);
  const { before, after } = await saveNumberSettings(body);
  await auditEsim(request, session, {
    resourceId: "esim:number-settings",
    resourceName: "Number card settings",
    summary: "Changed the number card settings",
    before: { ...before },
    after: { ...after },
  });
  return successResponse(after);
});
