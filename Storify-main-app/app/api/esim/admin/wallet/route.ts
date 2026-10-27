import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { validateBody } from "@/lib/api/validate";
import { WalletSettingsSchema, saveWalletSettings } from "@/lib/esim/admin/wallet";
import { ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";

/** Save the wallet top-up settings (on/off, amounts, fee). */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const body = await validateBody(request, WalletSettingsSchema);
  const { before, after } = await saveWalletSettings(body);
  await auditEsim(request, session, {
    resourceId: "esim:wallet",
    resourceName: "eSIM wallet top-ups",
    summary: "Changed the wallet top-up settings",
    before: { ...before },
    after: { ...after },
  });
  return successResponse(after);
});
