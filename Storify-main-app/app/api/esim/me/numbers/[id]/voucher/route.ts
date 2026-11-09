import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { connectDB } from "@/lib/db";
import { redeemNumberVoucher } from "@/lib/esim/numbers/services";

const VoucherSchema = z.object({ pin: z.string().trim().min(6).max(40) });

/** Puts a TopConnect recharge voucher (its PIN) on one of the shopper's numbers. */
export const POST = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:number-voucher", preset: "strict" } },
  async ({ request, params, session }) => {
    const body = await validateBody(request, VoucherSchema);
    await connectDB();
    const result = await redeemNumberVoucher(session.user.id, params.id, body.pin);
    if (result === null) throw new NotFoundError("Number not found");
    if (!result.ok) throw new ValidationError(result.message);
    return successResponse({ redeemed: true });
  },
);
