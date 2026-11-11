import { transferFromMyNumberRoute } from "@/lib/esim/mobile/number-services";
import { privateRoute } from "@/lib/api-next/routes";

/** Credit from a number to another; see lib/esim/mobile/number-services.ts. */
export const POST = privateRoute(transferFromMyNumberRoute);
