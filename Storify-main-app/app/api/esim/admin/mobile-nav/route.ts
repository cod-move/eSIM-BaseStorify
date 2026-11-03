import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { validateBody } from "@/lib/api/validate";
import { MobileNavSchema, saveMobileNavSettings } from "@/lib/esim/admin/mobile-nav";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

/** Save the storefront bottom tab bar (patch P32); an empty list restores the store's own. */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const body = await validateBody(request, MobileNavSchema);
  const { before, after } = await saveMobileNavSettings(body);
  await auditEsim(request, session, {
    resourceId: "esim:mobile-nav",
    resourceName: "Mobile navigation",
    summary: "Changed the storefront bottom tab bar",
    before: { tabs: before },
    after: { tabs: after },
  });
  return successResponse({ tabs: after });
});
