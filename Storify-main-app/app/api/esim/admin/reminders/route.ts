import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { validateBody } from "@/lib/api/validate";
import { ReminderSettingsSchema, saveReminderSettings } from "@/lib/esim/admin/reminders";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

/** Save the shopper reminder settings (on/off and thresholds). */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const body = await validateBody(request, ReminderSettingsSchema);
  const { before, after } = await saveReminderSettings(body);
  await auditEsim(request, session, {
    resourceId: "esim:reminders",
    resourceName: "eSIM reminders",
    summary: "Changed the eSIM shopper reminders",
    before: { ...before },
    after: { ...after },
  });
  return successResponse(after);
});
