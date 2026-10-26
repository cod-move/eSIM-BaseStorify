import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { validateBody } from "@/lib/api/validate";
import { savePricing } from "@/lib/esim/admin/pricing";
import { PricingChangeSchema } from "@/lib/esim/admin/pricing-schema";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

/** Save pricing settings or one rule, then re-price every plan not priced by hand (ADM-04). */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const change = await validateBody(request, PricingChangeSchema);
  const { before, after, repriced } = await savePricing(change);
  await auditEsim(request, session, {
    resourceId: change.rule ? `esim:pricing-rule:${change.rule.id ?? "new"}` : "esim:pricing",
    resourceName: "eSIM pricing",
    summary: change.rule?.remove
      ? "Removed an eSIM pricing rule"
      : change.rule
        ? "Saved an eSIM pricing rule"
        : "Changed the eSIM pricing settings",
    before,
    after: { ...after, repriced: repriced.changed },
  });
  return successResponse({ repriced });
});
