import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { connectDB } from "@/lib/db";
import { sendSmsToOwnNumber } from "@/lib/esim/numbers/card-tools";
import { SMS_MAX_CHARS } from "@/lib/esim/providers/topconnect";

const SmsSchema = z.object({
  from: z.string().trim().regex(/^\+?\d{3,15}$/),
  message: z.string().trim().min(1).refine((value) => [...value].length <= SMS_MAX_CHARS),
});

/** The shopper sends a text message to their own number, to check it receives (the live store's "SMS to myself"). */
export const POST = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:number-sms", preset: "strict" } },
  async ({ request, params, session }) => {
    const body = await validateBody(request, SmsSchema);
    await connectDB();
    const result = await sendSmsToOwnNumber(session.user.id, params.id, { from: body.from.replace(/^\+/, ""), message: body.message });
    if (result === null) throw new NotFoundError("Number not found");
    if (!result.sent) throw new ValidationError(result.message ?? "The message could not be sent");
    return successResponse({ sent: true });
  },
);
