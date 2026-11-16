import { esimCustomerEsimsRoute } from "@/lib/esim/mobile-biz/routes";
import { bizPrivateRoute } from "@/lib/api-next/routes";

/** One customer's eSIMs and number cards (business app, eSIM area); see lib/esim/mobile-biz/routes.ts. */
export const GET = bizPrivateRoute(esimCustomerEsimsRoute);
