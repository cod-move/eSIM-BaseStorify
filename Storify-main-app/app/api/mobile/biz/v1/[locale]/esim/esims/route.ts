import { esimListRoute } from "@/lib/esim/mobile-biz/routes";
import { bizPrivateRoute } from "@/lib/api-next/routes";

/** Every issued eSIM (business app, eSIM area); see lib/esim/mobile-biz/routes.ts. */
export const GET = bizPrivateRoute(esimListRoute);
