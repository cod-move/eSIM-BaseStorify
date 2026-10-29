import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { esimFulfilOrder } from "@/lib/esim/fulfillment";
import { settleOrderDelivery } from "@/lib/esim/fulfillment/delivery";
import {
  JobActionError,
  adminBindEsim,
  adminFailJob,
  adminMarkRefunded,
  adminRetryJob,
  adminReviewOrder,
} from "@/lib/esim/fulfillment/service";
import { ESIM_WRITE, auditEsim, runAfterResponse } from "@/lib/esim/admin/route";

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("retry") }),
  z.object({ action: z.literal("switch"), candidateIndex: z.number().int().min(0) }),
  z.object({ action: z.literal("fail") }),
  z.object({ action: z.literal("refunded"), note: z.string().max(200).default("") }),
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject") }),
  z.object({ action: z.literal("bind"), candidateIndex: z.number().int().min(0), iccid: z.string().min(10).max(30) }),
]);

/**
 * An admin's action on a fulfilment job that needs a person (ADM-08). Retrying
 * or switching supplier buys after the response; giving up settles the order
 * (the shopper is refunded); binding records an eSIM bought by hand and
 * delivers it. Approving an order held for review (ORD-13) buys its eSIMs;
 * rejecting it leaves the payment to be refunded in Storify.
 */
export const POST = withApi<{ id: string }>(ESIM_WRITE, async ({ request, params, session }) => {
  const body = await validateBody(request, ActionSchema);
  const actor = session.user.email ?? session.user.id;
  let result: { orderId: string; profileId?: string };
  try {
    switch (body.action) {
      case "retry":
        result = await adminRetryJob(params.id, { actor });
        break;
      case "switch":
        result = await adminRetryJob(params.id, { candidateIndex: body.candidateIndex, actor });
        break;
      case "fail":
        result = await adminFailJob(params.id, actor);
        break;
      case "refunded":
        result = await adminMarkRefunded(params.id, body.note, actor);
        break;
      case "approve":
        result = await adminReviewOrder(params.id, "approved", actor);
        break;
      case "reject":
        result = await adminReviewOrder(params.id, "rejected", actor);
        break;
      case "bind":
        result = await adminBindEsim(params.id, { candidateIndex: body.candidateIndex, iccid: body.iccid, actor });
        break;
    }
  } catch (error) {
    if (error instanceof JobActionError) throw new ValidationError(error.message);
    throw error;
  }
  await auditEsim(request, session, {
    resourceId: `esim:job:${params.id}`,
    resourceName: `eSIM fulfilment ${params.id}`,
    summary: `eSIM fulfilment: ${body.action}`,
    after: { ...body, orderId: result.orderId },
  });
  if (body.action === "retry" || body.action === "switch" || body.action === "approve") {
    await runAfterResponse(async () => {
      await esimFulfilOrder(result.orderId).then(() => undefined, (error) => console.error("eSIM retry failed:", error));
    });
  } else if (body.action !== "refunded") {
    await runAfterResponse(async () => {
      await settleOrderDelivery(result.orderId).then(() => undefined, (error) => console.error("eSIM settlement failed:", error));
    });
  }
  return successResponse(result);
});
