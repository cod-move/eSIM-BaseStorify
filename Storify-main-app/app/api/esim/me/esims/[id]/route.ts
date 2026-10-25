import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { getCustomerEsim, updateRemark } from "@/lib/esim/account/esims";

const RemarkSchema = z.object({ remark: z.string().max(100) });

/** One of the shopper's own eSIMs (USR-02). */
export const GET = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:read", preset: "browse" } },
  async ({ params, session }) => {
    const esim = await getCustomerEsim(session.user.id, params.id);
    if (!esim) throw new NotFoundError("eSIM not found");
    return successResponse(esim);
  },
);

/** The shopper's own name for the eSIM, e.g. "Japan trip" (USR-06). */
export const PATCH = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:remark", preset: "moderate" }, demo: "allow" },
  async ({ request, params, session }) => {
    const { remark } = await validateBody(request, RemarkSchema);
    if (!(await updateRemark(session.user.id, params.id, remark))) throw new NotFoundError("eSIM not found");
    return successResponse({ remark: remark.trim() || null });
  },
);
