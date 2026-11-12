import * as z from "zod";
import { connectDB } from "@/lib/db";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { ESIM_READ, ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";
import { adjustCardCredit, cardCreditView } from "@/lib/esim/numbers/admin-adjust";
import { MAX_CARD_ADJUSTMENT_MINOR } from "@/lib/esim/numbers/adjust-policy";
import { formatAmount } from "@/lib/esim/numbers/line";

/** A number card's balance (read from TopConnect with `?refresh=1`) and its latest admin adjustments. */
export const GET = withApi<{ id: string }>(ESIM_READ, async ({ request, params }) => {
  await connectDB();
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  const view = await cardCreditView(params.id, { refresh });
  if (!view) throw new NotFoundError("Number not found");
  return successResponse(view);
});

const AdjustSchema = z.object({
  direction: z.enum(["add", "deduct"]),
  /** Cents of the card's currency: a whole number, never floating point. */
  amountMinor: z.number().int().min(1).max(MAX_CARD_ADJUSTMENT_MINOR),
  reason: z.string().trim().min(1, "Say why the card's credit changes").max(500),
  /** One per opening of the dialog, so a double click moves money once. */
  requestId: z.string().trim().min(8).max(100),
});

/** Adds credit to the card at TopConnect, or takes some off (never below zero). */
export const POST = withApi<{ id: string }>(ESIM_WRITE, async ({ request, params, session }) => {
  const body = await validateBody(request, AdjustSchema);
  await connectDB();
  const result = await adjustCardCredit({
    numberId: params.id,
    direction: body.direction,
    amountMinor: body.amountMinor,
    reason: body.reason,
    key: `admin-card-credit:${params.id}:${body.requestId}`,
    admin: { id: String(session?.user?.id ?? ""), email: session?.user?.email ?? null },
  });
  if (!result) throw new NotFoundError("Number not found");
  if (!result.ok) throw new ValidationError(result.message);
  if (result.created) {
    const { adjustment } = result;
    await auditEsim(request, session, {
      resourceId: `esim:number:${params.id}`,
      resourceName: `Number card credit`,
      summary: `${adjustment.direction === "add" ? "Added" : "Deducted"} ${formatAmount(adjustment.amountMinor, adjustment.currency)} ${adjustment.direction === "add" ? "to" : "from"} a number card (${adjustment.state}) — ${adjustment.reason.slice(0, 200)}`,
      before: { balanceMinor: adjustment.balanceBeforeMinor },
      after: {
        adjustmentId: adjustment.id,
        direction: adjustment.direction,
        amountMinor: adjustment.amountMinor,
        currency: adjustment.currency,
        state: adjustment.state,
        balanceMinor: result.balanceMinor,
        reason: adjustment.reason,
      },
    });
  }
  return successResponse(result);
});
