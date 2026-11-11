import { smsMyNumberRoute } from "@/lib/esim/mobile/number-services";
import { privateRoute } from "@/lib/api-next/routes";

/** A test text to the number itself; see lib/esim/mobile/number-services.ts. */
export const POST = privateRoute(smsMyNumberRoute);
