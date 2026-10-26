import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/api/errors";
import { isEsimJob, runJobNow } from "@/lib/esim/admin/jobs";
import { ESIM_WRITE, auditEsim, runAfterResponse } from "@/lib/esim/admin/route";

/** Run an eSIM scheduled job now (ADM-10); it runs after the response and the page shows the result. */
export const POST = withApi<{ job: string }>(ESIM_WRITE, async ({ request, params, session }) => {
  if (!isEsimJob(params.job)) throw new NotFoundError("Unknown job");
  const job = params.job;
  await auditEsim(request, session, { resourceId: `esim:job-run:${job}`, resourceName: `eSIM job ${job}`, summary: `Ran the ${job} job by hand` });
  await runAfterResponse(async () => {
    const result = await runJobNow(job);
    if (!result.ok) console.error(`eSIM job ${job} failed:`, result.error);
  });
  return successResponse({ started: true });
});
