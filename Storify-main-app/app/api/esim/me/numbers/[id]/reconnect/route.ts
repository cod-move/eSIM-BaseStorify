import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { connectDB } from "@/lib/db";
import { reconnectNumber } from "@/lib/esim/numbers/services";

/** Restarts the SIM of one of the shopper's numbers so it registers on the network again. */
export const POST = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:number-reconnect", preset: "strict" } },
  async ({ params, session }) => {
    await connectDB();
    const result = await reconnectNumber(session.user.id, params.id);
    if (result === null) throw new NotFoundError("Number not found");
    if (!result.ok) throw new ValidationError(result.message);
    return successResponse({ reconnectAfter: result.reconnectAfter });
  },
);
