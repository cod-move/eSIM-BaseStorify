import { myNumberServicesRoute, setMyNumberServiceRoute } from "@/lib/esim/mobile/number-services";
import { privateRoute } from "@/lib/api-next/routes";

/** A number's services, and switching one; see lib/esim/mobile/number-services.ts. */
export const GET = privateRoute(myNumberServicesRoute);
export const POST = privateRoute(setMyNumberServiceRoute);
