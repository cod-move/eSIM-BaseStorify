import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";
import { adjustRewardBalance } from "@/lib/esim/telegram/service";

const AdjustSchema = z.object({
  email: z.string().trim().email(),
  /** + adds data, − takes it; never below zero. */
  mb: z.number().int().min(-10_000_000).max(10_000_000).refine((value) => value !== 0, "Enter an amount"),
  note: z.string().trim().min(1).max(500),
});

/** Adds data to, or takes it from, a shopper's check-in balance, with a reason (e.g. a reward eSIM that failed). */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const body = await validateBody(request, AdjustSchema);
  const result = await adjustRewardBalance({ ...body, by: session.user.id });
  if (!result.ok) {
    throw new ValidationError(result.reason === "no_user" ? "No account has this email" : "The balance is smaller than the amount to take");
  }
  await auditEsim(request, session, {
    resourceId: "esim:telegram",
    resourceName: "eSIM Telegram check-in",
    summary: `${body.mb > 0 ? "Added" : "Took"} ${Math.abs(body.mb)} MB ${body.mb > 0 ? "to" : "from"} ${body.email}: ${body.note}`,
  });
  return successResponse(result);
});
