import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { validateBody } from "@/lib/api/validate";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";
import { TelegramSettingsSchema, saveTelegramSettings } from "@/lib/esim/telegram/service";

/** Save the Telegram check-in settings: on/off, groups, the amounts, the day's cap, and what can be exchanged. */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const body = await validateBody(request, TelegramSettingsSchema);
  let saved;
  try {
    saved = await saveTelegramSettings(body);
  } catch (error) {
    throw new ValidationError((error as Error).message);
  }
  await auditEsim(request, session, {
    resourceId: "esim:telegram",
    resourceName: "eSIM Telegram check-in",
    summary: "Changed the Telegram check-in settings",
    before: { ...saved.before },
    after: { ...saved.after },
  });
  return successResponse(saved.after);
});
