import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { markPaymentRefunded } from "@/lib/esim/admin/payments";
import { settlePayment } from "@/lib/esim/payments/service";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

const ActionSchema = z.object({ action: z.enum(["refunded", "settle"]) });

/**
 * An admin's action on one payment: record that money owed back (paid twice,
 * or after the checkout closed) was sent back by hand, or settle a paid
 * payment again now instead of waiting for the sweep.
 */
export const POST = withApi<{ id: string }>(ESIM_WRITE, async ({ request, params, session }) => {
  const body = await validateBody(request, ActionSchema);
  let after: unknown;
  try {
    after = body.action === "refunded" ? await markPaymentRefunded(params.id) : { outcome: await settlePayment(params.id) };
  } catch (error) {
    throw new ValidationError(error instanceof Error ? error.message : String(error));
  }
  await auditEsim(request, session, {
    resourceId: `esim:payment:${params.id}`,
    resourceName: `eSIM payment ${params.id}`,
    summary: `eSIM payment: ${body.action}`,
    after: after as Record<string, unknown>,
  });
  return successResponse(after);
});
