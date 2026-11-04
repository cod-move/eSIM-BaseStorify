import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { validateBody } from "@/lib/api/validate";
import { updateProvider } from "@/lib/esim/admin/providers";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";
import { ValidationError } from "@/lib/api/errors";
import { currentRates } from "@/lib/esim/pricing/fx-service";

const ProviderSchema = z.object({
  name: z.string().max(80).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  priority: z.coerce.number().int().min(0).max(1000).optional(),
  settlementCurrency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
  credentials: z.record(z.string(), z.string().max(2000)).optional(),
});

/** Switch a supplier on or off; its priority and credentials (ADM-01). */
export const PATCH = withApi<{ code: string }>(ESIM_WRITE, async ({ request, params, session }) => {
  const body = await validateBody(request, ProviderSchema);
  // A supplier billing in a currency with no rate could not be priced: ask for the rate first.
  const currency = body.settlementCurrency?.toUpperCase();
  if (currency && currency !== "USD" && !(await currentRates([currency])).has(currency)) {
    throw new ValidationError(`No exchange rate for ${currency} yet: add one under eSIM → Exchange rates first`);
  }
  const { before, after } = await updateProvider(params.code, body);
  await auditEsim(request, session, {
    resourceId: `esim:provider:${params.code}`,
    resourceName: `eSIM supplier ${params.code}`,
    summary: `Updated eSIM supplier ${params.code}`,
    before,
    after,
  });
  return successResponse(after);
});
