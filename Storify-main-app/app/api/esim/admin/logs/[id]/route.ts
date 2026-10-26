import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/api/errors";
import { getLog } from "@/lib/esim/admin/logs";
import { ESIM_READ } from "@/lib/esim/admin/route";

/** One supplier call with its redacted request and response (ADM-09). */
export const GET = withApi<{ id: string }>(ESIM_READ, async ({ params }) => {
  const log = await getLog(params.id);
  if (!log) throw new NotFoundError("Log not found");
  return successResponse(log);
});
