import { esimReferralFriendsRoute } from "@/lib/esim/mobile/account";
import { privateRoute } from "@/lib/api-next/routes";

/** The friends who joined with the shopper's link, a page at a time (APP-07); see lib/esim/mobile/account.ts. */
export const GET = privateRoute(esimReferralFriendsRoute);
