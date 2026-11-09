import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/api/errors";
import { connectDB } from "@/lib/db";
import { numberHistory } from "@/lib/esim/numbers/services";
import { isHistoryDays } from "@/lib/esim/numbers/service-policy";

/** Calls, texts, data sessions, recharges and voicemail messages of one of the shopper's numbers (`?days=7|30|90`). */
export const GET = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:number-history", preset: "browse" } },
  async ({ request, params, session }) => {
    const requested = Number(new URL(request.url).searchParams.get("days") ?? 30);
    const days = isHistoryDays(requested) ? requested : 30;
    await connectDB();
    const history = await numberHistory(session.user.id, params.id, days);
    if (!history) throw new NotFoundError("Number not found");
    return successResponse(history);
  },
);
