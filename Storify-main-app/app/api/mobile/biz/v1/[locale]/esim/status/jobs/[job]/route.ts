import { esimJobRunRoute } from "@/lib/esim/mobile-biz/routes";
import { bizPrivateRoute } from "@/lib/api-next/routes";

/** Run an eSIM scheduled job now (business app, eSIM area); see lib/esim/mobile-biz/routes.ts. */
export const POST = bizPrivateRoute(esimJobRunRoute);
