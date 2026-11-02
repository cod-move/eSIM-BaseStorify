import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { validateBody } from "@/lib/api/validate";
import { PaymentFeesSchema, savePaymentFees } from "@/lib/esim/admin/payment-fees";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

/** Save the payment fee of each checkout method (patch P29). */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const body = await validateBody(request, PaymentFeesSchema);
  const { before, after } = await savePaymentFees(body.fees);
  await auditEsim(request, session, {
    resourceId: "esim:payment-fees",
    resourceName: "Payment fees",
    summary: "Changed the payment fees",
    before: { fees: before },
    after: { fees: after },
  });
  return successResponse(after);
});
