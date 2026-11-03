import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { validateBody } from "@/lib/api/validate";
import { MobileMenuSchema, saveMobileMenuSettings } from "@/lib/esim/admin/mobile-nav";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";
import type { MobileMenuSettings } from "@/lib/esim/storefront/mobile-nav";

/** Save the storefront side menu (patch P33): parts hidden, and eSIM links under Home. */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const body = await validateBody(request, MobileMenuSchema);
  const { before, after } = await saveMobileMenuSettings(body as MobileMenuSettings);
  await auditEsim(request, session, {
    resourceId: "esim:mobile-menu",
    resourceName: "Mobile side menu",
    summary: "Changed the storefront side menu",
    before: { ...before },
    after: { ...after },
  });
  return successResponse(after);
});
