import { cancelMyEsimRoute } from "@/lib/esim/mobile/esims";
import { privateRoute } from "@/lib/api-next/routes";

/** The shopper cancels an eSIM (USR-07); see lib/esim/mobile/esims.ts. */
export const POST = privateRoute(cancelMyEsimRoute);
