import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/api/errors";
import { refreshCustomerEsim } from "@/lib/esim/account/esims";

/**
 * The shopper asks for their eSIM's latest usage and status (USR-04). The
 * supplier is called at most once a minute per eSIM; within that, or when
 * the supplier fails, the stored snapshot comes back with the reason.
 */
export const POST = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:refresh", preset: "moderate" } },
  async ({ params, session }) => {
    const result = await refreshCustomerEsim(session.user.id, params.id);
    if (!result.view) throw new NotFoundError("eSIM not found");
    return successResponse(result);
  },
);
