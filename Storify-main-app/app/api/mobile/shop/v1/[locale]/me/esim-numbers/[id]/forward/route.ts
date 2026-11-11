import { forwardMyNumberRoute } from "@/lib/esim/mobile/number-services";
import { privateRoute } from "@/lib/api-next/routes";

/** A number's call forwarding; see lib/esim/mobile/number-services.ts. */
export const POST = privateRoute(forwardMyNumberRoute);
