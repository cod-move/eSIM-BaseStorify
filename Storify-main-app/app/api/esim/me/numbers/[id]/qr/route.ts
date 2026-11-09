import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { connectDB } from "@/lib/db";
import { requestNewQr } from "@/lib/esim/numbers/requests";

const QrSchema = z.object({ key: z.string().trim().min(8).max(80) });

/** Asks for a new QR code for one of the shopper's numbers; the fee comes off the number's credit. */
export const POST = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:number-qr", preset: "strict" } },
  async ({ request, params, session }) => {
    const body = await validateBody(request, QrSchema);
    await connectDB();
    const result = await requestNewQr(session.user.id, params.id, body.key);
    if (result === null) throw new NotFoundError("Number not found");
    if (!result.ok) throw new ValidationError(result.message);
    return successResponse({ state: result.state, message: result.message ?? null });
  },
);
