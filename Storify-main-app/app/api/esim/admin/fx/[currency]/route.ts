import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { validateBody } from "@/lib/api/validate";
import { ValidationError } from "@/lib/api/errors";
import { overrideFx } from "@/lib/esim/admin/pricing";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

/** US dollars per one unit of the currency; null removes the override and goes back to the ECB rate. */
const OverrideSchema = z.object({ usdPerUnit: z.number().positive().max(100_000).nullable() });

export const PUT = withApi<{ currency: string }>(ESIM_WRITE, async ({ request, params, session }) => {
  const currency = params.currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency) || currency === "USD") throw new ValidationError("Not a currency that can be overridden");
  const { usdPerUnit } = await validateBody(request, OverrideSchema);
  const repriced = await overrideFx(currency, usdPerUnit, session.user.email ?? session.user.id);
  await auditEsim(request, session, {
    resourceId: `esim:fx:${currency}`,
    resourceName: `eSIM exchange rate ${currency}`,
    summary: usdPerUnit === null ? `Removed the ${currency} rate override` : `Set ${currency} to ${usdPerUnit} USD by hand`,
    after: { currency, usdPerUnit, repriced: repriced.changed },
  });
  return successResponse({ repriced });
});
