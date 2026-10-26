import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { probeProvider } from "@/lib/esim/admin/providers";
import { ESIM_WRITE } from "@/lib/esim/admin/route";

/** Test the connection: one authenticated call, which also reports the balance where the supplier's check does. */
export const POST = withApi<{ code: string }>(ESIM_WRITE, async ({ params }) => successResponse(await probeProvider(params.code)));
