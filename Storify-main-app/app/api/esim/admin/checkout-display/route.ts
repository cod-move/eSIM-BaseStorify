import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { CheckoutDisplaySchema, getCheckoutDisplayAdmin, saveCheckoutDisplay } from "@/lib/esim/admin/checkout-display";
import { ESIM_READ, ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";
import { ESIM_MANAGE } from "@/lib/esim/admin/permissions";
import { getAdminTeamAccess } from "@/lib/access/admin-page-guard";
import { teamHasAny } from "@/lib/access/team-permissions";
import { CACHE_TAGS, revalidateCacheTags } from "@/lib/cache-invalidation";

/** How checkout lists its payment methods (patch P34): order, default and icons. */
/** With `canManage`: whether this admin may change it (and the eSIM gateways and fees beside it). */
export const GET = withApi(ESIM_READ, async ({ session }) => {
  const access = await getAdminTeamAccess(session.user.id);
  return successResponse({ ...(await getCheckoutDisplayAdmin()), canManage: teamHasAny(access, ESIM_MANAGE) });
});

export const PUT = withApi(ESIM_WRITE, async ({ request, session }) => {
  const body = await validateBody(request, CheckoutDisplaySchema);
  let result: Awaited<ReturnType<typeof saveCheckoutDisplay>>;
  try {
    result = await saveCheckoutDisplay(body);
  } catch (error) {
    throw new ValidationError(error instanceof Error ? error.message : String(error));
  }
  // Checkout reads it from Storify's public settings, cached under "settings".
  revalidateCacheTags([CACHE_TAGS.settings]);
  const pick = ({ order, defaultMethod, icons }: typeof result.before) => ({ order, defaultMethod, icons });
  await auditEsim(request, session, {
    resourceId: "esim:checkout-display",
    resourceName: "Checkout payment methods",
    summary: "Changed how checkout lists the payment methods",
    before: pick(result.before),
    after: pick(result.after),
  });
  return successResponse(result.after);
});
