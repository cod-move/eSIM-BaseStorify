import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { connectDB } from "@/lib/db";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";
import { completeQrRequest, rejectQrRequest } from "@/lib/esim/numbers/requests";

const AnswerSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("complete"), lpa: z.string().trim().min(10).max(400), note: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("reject"), note: z.string().trim().min(1).max(500) }),
]);

/** A person answers a new-QR-code request: the new activation code, or declined (the fee goes back on the number). */
export const POST = withApi<{ requestId: string }>(ESIM_WRITE, async ({ request, params, session }) => {
  const body = await validateBody(request, AnswerSchema);
  await connectDB();
  const adminId = session?.user?.id ?? "";
  const result = body.action === "complete" ? await completeQrRequest(adminId, params.requestId, body) : await rejectQrRequest(adminId, params.requestId, body.note);
  if (!result.ok) throw new ValidationError(result.message);
  await auditEsim(request, session, {
    resourceId: `esim:number-request:${params.requestId}`,
    resourceName: "Number new QR code request",
    summary: body.action === "complete" ? "Saved a new activation code for a number" : "Declined a new QR code request",
    before: result.before,
    after: result.after,
  });
  return successResponse({ ok: true });
});
