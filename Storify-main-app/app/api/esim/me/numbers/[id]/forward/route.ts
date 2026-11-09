import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { connectDB } from "@/lib/db";
import { setNumberForwarding } from "@/lib/esim/numbers/services";

const ForwardSchema = z.object({ to: z.string().trim().max(24).nullable() });

/** Forwards every call to another number (with its country code), or stops forwarding (`to: null`). */
export const POST = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:number-forward", preset: "strict" } },
  async ({ request, params, session }) => {
    const body = await validateBody(request, ForwardSchema);
    await connectDB();
    const result = await setNumberForwarding(session.user.id, params.id, body.to ? body.to : null);
    if (result === null) throw new NotFoundError("Number not found");
    if (!result.ok) throw new ValidationError(result.message);
    return successResponse({ forwardTo: result.forwardTo });
  },
);
