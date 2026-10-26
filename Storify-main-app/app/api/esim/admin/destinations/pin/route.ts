import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { setPin } from "@/lib/esim/admin/destinations";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

const PinSchema = z.object({
  productSlug: z.string().min(1).max(120),
  variantKey: z.string().min(1).max(80).regex(/^[a-z_]+\|\d+\|(\d+|perday)$/),
  planId: z.string().max(40).nullable(),
});

/** Pins a variant's primary supplier plan, or unpins it, and re-publishes the destination (ADM-06). */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const body = await validateBody(request, PinSchema);
  let result;
  try {
    result = await setPin(body.productSlug, body.variantKey, body.planId);
  } catch (error) {
    throw new ValidationError(error instanceof Error ? error.message : String(error));
  }
  await auditEsim(request, session, {
    resourceId: `esim:destination:${body.productSlug}`,
    resourceName: `eSIM destination ${body.productSlug}`,
    summary: body.planId ? `Pinned the primary supplier of ${body.variantKey}` : `Unpinned ${body.variantKey}`,
    after: body,
  });
  return successResponse(result);
});
