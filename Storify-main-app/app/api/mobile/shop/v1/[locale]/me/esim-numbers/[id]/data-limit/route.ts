import { myNumberDataLimitRoute, setMyNumberDataLimitRoute } from "@/lib/esim/mobile/number-services";
import { privateRoute } from "@/lib/api-next/routes";

/** A number's daily data spending limit; see lib/esim/mobile/number-services.ts. */
export const GET = privateRoute(myNumberDataLimitRoute);
export const POST = privateRoute(setMyNumberDataLimitRoute);
