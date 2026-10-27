import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { ReferralCodeError } from "@/lib/esim/referral/rules";
import { setReferralCode } from "@/lib/esim/referral/service";

const CodeSchema = z.object({ code: z.string().min(1).max(40) });

/** The shopper chooses their own referral code (REF-01/05). */
export const PATCH = withApi(
  { auth: "user", rateLimit: { action: "esim:referral:code", preset: "moderate" } },
  async ({ request, session }) => {
    const body = await validateBody(request, CodeSchema);
    try {
      return successResponse({ code: await setReferralCode(session.user.id, body.code) });
    } catch (error) {
      if (error instanceof ReferralCodeError) throw new ValidationError(error.message);
      throw error;
    }
  },
);
