import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { listAdminPaymentMethods } from "@/lib/esim/admin/payments";
import { ESIM_READ } from "@/lib/esim/admin/route";

/** The eSIM payment methods and their settings (secrets as set / not set), for Storify's payment settings page (P15, P34). */
export const GET = withApi(ESIM_READ, async () => successResponse(await listAdminPaymentMethods()));
