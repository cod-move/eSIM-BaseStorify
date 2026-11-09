import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/api/errors";
import { connectDB } from "@/lib/db";
import { numberDiagnostics } from "@/lib/esim/numbers/services";

/** What the network last saw of one of the shopper's numbers: latest activity, registrations and the open data session. */
export const GET = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:number-diagnostics", preset: "browse" } },
  async ({ params, session }) => {
    await connectDB();
    const result = await numberDiagnostics(session.user.id, params.id);
    if (!result) throw new NotFoundError("Number not found");
    return successResponse(result);
  },
);
