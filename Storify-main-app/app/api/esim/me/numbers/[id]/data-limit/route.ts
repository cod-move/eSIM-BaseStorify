import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { connectDB } from "@/lib/db";
import { numberDataLimit, setNumberDataLimit } from "@/lib/esim/numbers/services";

/** The daily data spending limit of one of the shopper's numbers. */
export const GET = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:number-data-limit", preset: "browse" } },
  async ({ params, session }) => {
    await connectDB();
    const result = await numberDataLimit(session.user.id, params.id);
    if (!result) throw new NotFoundError("Number not found");
    return successResponse(result);
  },
);

const LimitSchema = z.object({ valueMinor: z.number().int().nullable() });

/** Sets the daily data spending limit (cents of the card's currency), or removes it (`valueMinor: null`). */
export const POST = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:number-data-limit-change", preset: "moderate" } },
  async ({ request, params, session }) => {
    const body = await validateBody(request, LimitSchema);
    await connectDB();
    const result = await setNumberDataLimit(session.user.id, params.id, body.valueMinor);
    if (result === null) throw new NotFoundError("Number not found");
    if (!result.ok) throw new ValidationError(result.message);
    return successResponse({ limit: result.limit });
  },
);
