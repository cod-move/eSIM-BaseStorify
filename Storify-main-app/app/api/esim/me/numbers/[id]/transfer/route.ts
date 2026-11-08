import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { connectDB } from "@/lib/db";
import { requestCardTransfer } from "@/lib/esim/numbers/card-tools";

const TransferSchema = z.object({
  to: z.string().trim().min(1),
  amountMinor: z.number().int().min(1).max(10_000_000),
  key: z.string().trim().min(8).max(100),
});

/** Credit from this number to another of the shopper's numbers; once per idempotency key. */
export const POST = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:number-transfer", preset: "strict" } },
  async ({ request, params, session }) => {
    const body = await validateBody(request, TransferSchema);
    await connectDB();
    const result = await requestCardTransfer(session.user.id, params.id, { toNumberId: body.to, amountMinor: body.amountMinor, key: body.key });
    if (result === null) throw new NotFoundError("Number not found");
    if (!result.ok) throw new ValidationError(result.message);
    return successResponse({ state: result.state, message: result.message ?? null });
  },
);
