import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { startProviderSync } from "@/lib/esim/admin/providers";
import { ESIM_WRITE, auditEsim, runAfterResponse } from "@/lib/esim/admin/route";

/** Sync the supplier's catalogue now; it runs after the response and the list shows its progress. */
export const POST = withApi<{ code: string }>(ESIM_WRITE, async ({ request, params, session }) => {
  const work = await startProviderSync(params.code);
  if (!work) return successResponse({ started: false, reason: "A sync is already running" });
  await auditEsim(request, session, {
    resourceId: `esim:provider:${params.code}`,
    resourceName: `eSIM supplier ${params.code}`,
    summary: `Started a catalogue sync for ${params.code}`,
  });
  await runAfterResponse(work);
  return successResponse({ started: true });
});
