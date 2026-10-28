import { esimReferralsRoute } from "@/lib/esim/mobile/account";
import { privateRoute } from "@/lib/api-next/routes";

/** The referral centre (APP-07); see lib/esim/mobile/account.ts. */
export const GET = privateRoute(esimReferralsRoute);
