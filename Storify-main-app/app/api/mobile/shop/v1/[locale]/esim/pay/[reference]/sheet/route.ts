import { esimSheetStartRoute } from "@/lib/esim/mobile/pay";
import { privateRoute } from "@/lib/api-next/routes";

/** A try paid in the gateway's native sheet in the app (APP-09); see lib/esim/mobile/pay.ts. */
export const POST = privateRoute(esimSheetStartRoute);
