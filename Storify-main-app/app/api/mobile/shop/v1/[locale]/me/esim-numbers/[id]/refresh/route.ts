import { refreshMyNumberRoute } from "@/lib/esim/mobile/numbers";
import { privateRoute } from "@/lib/api-next/routes";

/** A number's card read again (NUM-06); see lib/esim/mobile/numbers.ts. */
export const POST = privateRoute(refreshMyNumberRoute);
