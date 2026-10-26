import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { createHelpPages } from "@/lib/esim/admin/help-pages";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

/** Creates and publishes the eSIM help pages that do not exist yet (WEB-35). */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const result = await createHelpPages(session.user.id);
  await auditEsim(request, session, {
    resourceId: "esim:help-pages",
    resourceName: "eSIM help pages",
    summary: result.created.length ? `Created help pages: ${result.created.join(", ")}` : "Help pages already existed",
    after: result,
  });
  return successResponse(result);
});
