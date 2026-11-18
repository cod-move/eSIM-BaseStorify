import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/api/errors";
import { mongoose } from "@/lib/db";
import { User } from "@/models";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";
import { unlinkTelegram } from "@/lib/esim/telegram/service";

/** Unlinks a shopper's Telegram account (e.g. a lost or misused one); the data they saved stays. */
export const DELETE = withApi<{ userId: string }>(ESIM_WRITE, async ({ request, params, session }) => {
  if (!mongoose.isValidObjectId(params.userId) || !(await unlinkTelegram(params.userId))) {
    throw new NotFoundError("This account has no Telegram link");
  }
  const user = await User.findById(params.userId).select({ email: 1 }).lean<{ email?: string } | null>();
  await auditEsim(request, session, {
    resourceId: "esim:telegram",
    resourceName: "eSIM Telegram check-in",
    summary: `Unlinked the Telegram account of ${user?.email ?? params.userId}`,
  });
  return successResponse({ unlinked: true });
});
