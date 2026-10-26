import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/api/errors";
import { adminCancelEsim, adminRefreshEsim, adminResendEsim } from "@/lib/esim/admin/esims";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

/**
 * An admin's action on one eSIM (ADM-07): refresh its usage, send the
 * delivery email again, or cancel it at the supplier.
 */
export const POST = withApi<{ id: string; action: string }>(ESIM_WRITE, async ({ request, params, session }) => {
  const { id, action } = params;
  if (action === "refresh") return successResponse(await adminRefreshEsim(id));
  if (action === "resend") {
    const sent = await adminResendEsim(id);
    await auditEsim(request, session, { resourceId: `esim:esim:${id}`, resourceName: `eSIM ${id}`, summary: `Resent the eSIM delivery email (${sent ? "sent" : "not sent"})` });
    return successResponse({ sent });
  }
  if (action === "cancel") {
    const result = await adminCancelEsim(id);
    await auditEsim(request, session, { resourceId: `esim:esim:${id}`, resourceName: `eSIM ${id}`, summary: `Cancel eSIM at the supplier: ${result.message}`, after: result });
    return successResponse(result);
  }
  throw new NotFoundError("Unknown action");
});
