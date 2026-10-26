import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { esimFulfilOrder } from "@/lib/esim/fulfillment";
import { settleOrderDelivery } from "@/lib/esim/fulfillment/delivery";
import { TopupActionError, adminFailTopup, adminMarkTopupRefunded, adminRetryTopup } from "@/lib/esim/topup/service";
import { ESIM_WRITE, auditEsim, runAfterResponse } from "@/lib/esim/admin/route";

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("retry") }),
  z.object({ action: z.literal("fail") }),
  z.object({ action: z.literal("refunded"), note: z.string().max(200).default("") }),
]);

/**
 * An admin's action on a top-up that needs a person: try it again (same
 * supplier, same key), give up (the order's settlement refunds it), or record
 * a refund made by hand.
 */
export const POST = withApi<{ id: string }>(ESIM_WRITE, async ({ request, params, session }) => {
  const body = await validateBody(request, ActionSchema);
  const actor = session.user.email ?? session.user.id;
  let result: { orderId: string };
  try {
    result =
      body.action === "retry"
        ? await adminRetryTopup(params.id, actor)
        : body.action === "fail"
          ? await adminFailTopup(params.id, actor)
          : await adminMarkTopupRefunded(params.id, body.note, actor);
  } catch (error) {
    if (error instanceof TopupActionError) throw new ValidationError(error.message);
    throw error;
  }
  await auditEsim(request, session, {
    resourceId: `esim:topup:${params.id}`,
    resourceName: `eSIM top-up ${params.id}`,
    summary: `eSIM top-up: ${body.action}`,
    after: { ...body, orderId: result.orderId },
  });
  if (body.action === "retry") {
    await runAfterResponse(async () => {
      await esimFulfilOrder(result.orderId).then(() => undefined, (error) => console.error("eSIM top-up retry failed:", error));
    });
  } else if (body.action === "fail") {
    await runAfterResponse(async () => {
      await settleOrderDelivery(result.orderId).then(() => undefined, (error) => console.error("eSIM settlement failed:", error));
    });
  }
  return successResponse(result);
});
