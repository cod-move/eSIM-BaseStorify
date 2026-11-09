import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { connectDB } from "@/lib/db";
import { transferNumberOwnership } from "@/lib/esim/numbers/requests";

const OwnerSchema = z.object({ email: z.string().trim().email().max(200), key: z.string().trim().min(8).max(80) });

/** Moves one of the shopper's numbers to another account, found by its email. Permanent. */
export const POST = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:number-owner", preset: "strict" } },
  async ({ request, params, session }) => {
    const body = await validateBody(request, OwnerSchema);
    await connectDB();
    const result = await transferNumberOwnership(session.user.id, params.id, body);
    if (result === null) throw new NotFoundError("Number not found");
    if (!result.ok) throw new ValidationError(result.message);
    return successResponse({ state: result.state });
  },
);
