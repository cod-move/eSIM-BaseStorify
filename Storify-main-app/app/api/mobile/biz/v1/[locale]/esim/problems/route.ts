import { esimProblemsRoute } from "@/lib/esim/mobile-biz/routes";
import { bizPrivateRoute } from "@/lib/api-next/routes";

/** Fulfilment that needs a person (business app, eSIM area); see lib/esim/mobile-biz/routes.ts. */
export const GET = bizPrivateRoute(esimProblemsRoute);
