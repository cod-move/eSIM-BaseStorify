import { esimPayChoicesRoute } from "@/lib/esim/mobile/pay";
import { privateRoute } from "@/lib/api-next/routes";

/** The checkout's eSIM payment methods (APP-09); see lib/esim/mobile/pay.ts. */
export const GET = privateRoute(esimPayChoicesRoute);
