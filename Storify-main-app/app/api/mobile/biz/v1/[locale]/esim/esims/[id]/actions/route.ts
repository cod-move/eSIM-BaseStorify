import { esimActionRoute } from "@/lib/esim/mobile-biz/routes";
import { bizPrivateRoute } from "@/lib/api-next/routes";

/** An action on one eSIM (business app, eSIM area); see lib/esim/mobile-biz/routes.ts. */
export const POST = bizPrivateRoute(esimActionRoute);
