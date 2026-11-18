import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { createAuditContext } from "@/lib/audit";
import { esimFulfilOrder } from "@/lib/esim/fulfillment";
import { runAfterResponse } from "@/lib/esim/admin/route";
import { redeemReward } from "@/lib/esim/telegram/redeem";

const RedeemSchema = z.object({
  itemId: z.string().regex(/^[a-f0-9]{24}$/),
  /** Made by the page per tap, so a retried request spends once. */
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
});

const REASONS = {
  disabled: "Check-in rewards are not open at the moment.",
  no_item: "This eSIM can no longer be exchanged.",
  not_enough: "Not enough data saved for this eSIM.",
  failed: "The exchange did not go through and your data was given back. Please try again or contact us.",
} as const;

/** Spends saved-up check-in data on an eSIM: a paid order at no charge, issued as any other. */
export const POST = withApi(
  { auth: "user", rateLimit: { action: "esim:telegram:redeem", preset: "strict" } },
  async ({ request, session }) => {
    const body = await validateBody(request, RedeemSchema);
    const result = await redeemReward({ userId: session.user.id, itemId: body.itemId, requestId: body.requestId, audit: createAuditContext(request, session) });
    if (!result.ok) throw new ValidationError(REASONS[result.reason]);
    await runAfterResponse(() => esimFulfilOrder(result.orderId).then(() => undefined, (error) => console.error("Reward eSIM fulfilment failed:", error)));
    return successResponse(result);
  },
);
