import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { CancelError, cancelByShopper } from "@/lib/esim/cancel/service";

/** The shopper cancels an eSIM not installed yet, on a refundable plan (USR-07). */
export const POST = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:cancel", preset: "strict" } },
  async ({ params, session }) => {
    try {
      return successResponse(await cancelByShopper(session.user.id, params.id));
    } catch (error) {
      if (error instanceof CancelError) {
        if (error.message === "eSIM not found") throw new NotFoundError("eSIM not found");
        throw new ValidationError(error.message);
      }
      throw error;
    }
  },
);
