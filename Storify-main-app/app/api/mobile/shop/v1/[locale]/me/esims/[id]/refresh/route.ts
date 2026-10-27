import { refreshMyEsimRoute } from "@/lib/esim/mobile/esims";
import { privateRoute } from "@/lib/api-next/routes";

/** The eSIM module's shopper endpoint (APP-03); see lib/esim/mobile/esims.ts. */
export const POST = privateRoute(refreshMyEsimRoute);
