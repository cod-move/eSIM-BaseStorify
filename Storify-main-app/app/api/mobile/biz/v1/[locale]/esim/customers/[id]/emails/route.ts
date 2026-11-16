import { esimCustomerEmailSendRoute, esimCustomerEmailsRoute } from "@/lib/esim/mobile-biz/routes";
import { bizPrivateRoute } from "@/lib/api-next/routes";

/** Emails written to one customer by hand (business app, eSIM area); see lib/esim/mobile-biz/routes.ts. */
export const GET = bizPrivateRoute(esimCustomerEmailsRoute);
export const POST = bizPrivateRoute(esimCustomerEmailSendRoute);
