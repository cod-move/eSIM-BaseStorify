import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { ProviderError } from "@/lib/esim/providers/types";
import { TopupError, createTopupQuote, topupOffers } from "@/lib/esim/topup/offers";

const QuoteSchema = z.object({ topupPlanId: z.string().min(1).max(200) });

/**
 * The top-ups the shopper's eSIM can take now, priced (TOP-01/02): renewals
 * of its own plan and the other areas it can be topped up for; with
 * `?area=<id>`, that area's top-ups.
 */
export const GET = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:topup:list", preset: "moderate" } },
  async ({ request, params, session }) => {
    const area = new URL(request.url).searchParams.get("area")?.slice(0, 120) || null;
    const offers = await topupOffers(session.user.id, params.id, { area });
    if (!offers) throw new NotFoundError("eSIM not found");
    return successResponse(offers);
  },
);

/**
 * The shopper picked a top-up (TOP-03): the supplier is asked again, a quote
 * is written, and the answer is what the cart line needs — the top-up
 * product, its variant and the quote id for `lineAttributes.topup`.
 */
export const POST = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:topup:quote", preset: "moderate" } },
  async ({ request, params, session }) => {
    const body = await validateBody(request, QuoteSchema);
    try {
      const quote = await createTopupQuote(session.user.id, params.id, body.topupPlanId);
      if (!quote) throw new NotFoundError("eSIM not found");
      return successResponse(quote);
    } catch (error) {
      if (error instanceof TopupError || error instanceof ProviderError) throw new ValidationError(error.message);
      throw error;
    }
  },
);
