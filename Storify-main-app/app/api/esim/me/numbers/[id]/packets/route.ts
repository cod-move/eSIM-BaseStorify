import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { cancelCustomerPacket } from "@/lib/esim/numbers/account";

const CancelSchema = z.object({ action: z.literal("cancel"), packetId: z.string().trim().regex(/^\d{1,9}$/) });

/**
 * The shopper cancels one data package on their number (NUM-09): the exact
 * packet the card lists, never every package; unused data is not refunded.
 */
export const POST = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:number-packet", preset: "moderate" } },
  async ({ request, params, session }) => {
    const body = await validateBody(request, CancelSchema);
    const result = await cancelCustomerPacket(session.user.id, params.id, body.packetId);
    if (result === null) throw new NotFoundError("Number not found");
    if (!result.cancelled) throw new ValidationError(result.message ?? "The package could not be cancelled");
    return successResponse({ cancelled: true });
  },
);
