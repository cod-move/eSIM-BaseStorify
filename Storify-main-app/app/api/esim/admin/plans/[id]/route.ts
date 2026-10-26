import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { validateBody } from "@/lib/api/validate";
import { setManualPrice } from "@/lib/esim/admin/plans";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

/** A hand-set selling price in USD cents; null hands the plan back to the pricing rules. */
const PriceSchema = z.object({ retailPriceMinor: z.number().int().min(1).max(10_000_000).nullable() });

export const PATCH = withApi<{ id: string }>(ESIM_WRITE, async ({ request, params, session }) => {
  const { retailPriceMinor } = await validateBody(request, PriceSchema);
  const result = await setManualPrice(params.id, retailPriceMinor);
  await auditEsim(request, session, {
    resourceId: `esim:plan:${params.id}`,
    resourceName: `eSIM plan ${params.id}`,
    summary: retailPriceMinor === null ? "eSIM plan price back to the pricing rules" : "Set an eSIM plan's price by hand",
    before: result.before,
    after: result.after,
  });
  return successResponse(result);
});
