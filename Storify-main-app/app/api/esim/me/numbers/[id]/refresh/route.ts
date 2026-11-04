import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/api/errors";
import { refreshCustomerNumber } from "@/lib/esim/numbers/account";

/**
 * The shopper asks for their number's balance, state and packages (NUM-06).
 * TopConnect is asked at most every 10 seconds per number; when it fails,
 * the last known state stays and the page says so.
 */
export const POST = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:number-refresh", preset: "moderate" } },
  async ({ params, session }) => {
    const refreshed = await refreshCustomerNumber(session.user.id, params.id);
    if (refreshed === null) throw new NotFoundError("Number not found");
    return successResponse(refreshed ? { refreshed } : { refreshed, error: "TopConnect did not answer; showing the last known state" });
  },
);
