import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { validateBody } from "@/lib/api/validate";
import { CancellationSettingsSchema, saveCancellationSettings } from "@/lib/esim/admin/cancellation";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

/** Save the shopper cancellation settings (USR-07). */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const body = await validateBody(request, CancellationSettingsSchema);
  const { before, after } = await saveCancellationSettings(body);
  await auditEsim(request, session, {
    resourceId: "esim:cancellation",
    resourceName: "eSIM cancellation",
    summary: "Changed the eSIM cancellation settings",
    before: { ...before },
    after: { ...after },
  });
  return successResponse(after);
});
