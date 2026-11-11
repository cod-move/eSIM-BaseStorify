import { myNumberHistoryRoute } from "@/lib/esim/mobile/number-services";
import { privateRoute } from "@/lib/api-next/routes";

/** A number's usage history; see lib/esim/mobile/number-services.ts. */
export const GET = privateRoute(myNumberHistoryRoute);
