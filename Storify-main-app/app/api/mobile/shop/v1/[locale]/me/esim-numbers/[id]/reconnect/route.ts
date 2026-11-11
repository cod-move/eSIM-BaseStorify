import { reconnectMyNumberRoute } from "@/lib/esim/mobile/number-services";
import { privateRoute } from "@/lib/api-next/routes";

/** Reconnects a number's SIM; see lib/esim/mobile/number-services.ts. */
export const POST = privateRoute(reconnectMyNumberRoute);
