import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { validateBody } from "@/lib/api/validate";
import { getPaymentFees, PaymentFeesSchema, savePaymentFees } from "@/lib/esim/admin/payment-fees";
import { ESIM_READ, ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

/** Each checkout method's fee, for Storify's payment settings page (patch P29, P34). */
export const GET = withApi(ESIM_READ, async () => successResponse(await getPaymentFees()));

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
