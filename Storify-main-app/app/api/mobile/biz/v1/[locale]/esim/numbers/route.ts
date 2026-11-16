import { esimNumbersRoute } from "@/lib/esim/mobile-biz/routes";
import { bizPrivateRoute } from "@/lib/api-next/routes";

/** Phone numbers (business app, eSIM area); see lib/esim/mobile-biz/routes.ts. */
export const GET = bizPrivateRoute(esimNumbersRoute);
