import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { connectDB } from "@/lib/db";
import { releaseNumber } from "@/lib/esim/numbers/requests";

const ReleaseSchema = z.object({ confirm: z.string().trim().max(24), key: z.string().trim().min(8).max(80) });

/** Gives one of the shopper's numbers up (it leaves the account). Permanent. */
export const POST = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:number-release", preset: "strict" } },
  async ({ request, params, session }) => {
    const body = await validateBody(request, ReleaseSchema);
    await connectDB();
    const result = await releaseNumber(session.user.id, params.id, body);
    if (result === null) throw new NotFoundError("Number not found");
    if (!result.ok) throw new ValidationError(result.message);
    return successResponse({ state: result.state });
  },
);
