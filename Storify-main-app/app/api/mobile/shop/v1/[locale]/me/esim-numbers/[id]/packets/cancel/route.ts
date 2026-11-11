import { cancelMyNumberPacketRoute } from "@/lib/esim/mobile/numbers";
import { privateRoute } from "@/lib/api-next/routes";

/** Cancels a data package on a number (NUM-09); see lib/esim/mobile/numbers.ts. */
export const POST = privateRoute(cancelMyNumberPacketRoute);
