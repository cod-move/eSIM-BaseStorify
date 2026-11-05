import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { updatePaymentMethod } from "@/lib/esim/admin/payments";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";
import { CACHE_TAGS, revalidateCacheTags } from "@/lib/cache-invalidation";

const MethodSchema = z.object({
  name: z.string().max(80).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  sort: z.coerce.number().int().min(0).max(1000).optional(),
  credentials: z.record(z.string(), z.string().max(2000)).optional(),
});

/** Switch a payment method on or off; its name, order and settings (PAY, P15). */
export const PATCH = withApi<{ code: string }>(ESIM_WRITE, async ({ request, params, session }) => {
  const body = await validateBody(request, MethodSchema);
  let result: Awaited<ReturnType<typeof updatePaymentMethod>>;
  try {
    result = await updatePaymentMethod(params.code, body);
  } catch (error) {
    throw new ValidationError(error instanceof Error ? error.message : String(error));
  }
  // The methods checkout offers come with Storify's public settings, cached under "settings".
  revalidateCacheTags([CACHE_TAGS.settings]);
  await auditEsim(request, session, {
    resourceId: `esim:payment-method:${params.code}`,
    resourceName: `eSIM payment method ${params.code}`,
    summary: `Updated eSIM payment method ${params.code}`,
    before: result.before,
    after: result.after,
  });
  return successResponse(result.after);
});
