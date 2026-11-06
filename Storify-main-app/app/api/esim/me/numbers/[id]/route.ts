import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { connectDB } from "@/lib/db";
import { updateNumberRemark } from "@/lib/esim/numbers/account";

const RemarkSchema = z.object({ remark: z.string().max(100) });

/** The shopper's own name for one of their numbers, e.g. "Work line" (USR-06). */
export const PATCH = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:remark", preset: "moderate" }, demo: "allow" },
  async ({ request, params, session }) => {
    const { remark } = await validateBody(request, RemarkSchema);
    await connectDB();
    if (!(await updateNumberRemark(session.user.id, params.id, remark))) throw new NotFoundError("Number not found");
    return successResponse({ remark: remark.trim() || null });
  },
);
