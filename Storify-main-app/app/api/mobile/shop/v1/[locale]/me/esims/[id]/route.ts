import { deleteMyEsimRoute, myEsimRoute } from "@/lib/esim/mobile/esims";
import { privateRoute } from "@/lib/api-next/routes";

/** The eSIM module's shopper endpoint (APP-03/04); see lib/esim/mobile/esims.ts. */
export const GET = privateRoute(myEsimRoute);

/** The shopper deletes the eSIM from their list (only hidden from them). */
export const DELETE = privateRoute(deleteMyEsimRoute);
