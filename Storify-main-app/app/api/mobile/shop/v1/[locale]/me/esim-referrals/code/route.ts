import { esimReferralCodeRoute } from "@/lib/esim/mobile/account";
import { privateRoute } from "@/lib/api-next/routes";

/** Choosing a referral code (APP-07); see lib/esim/mobile/account.ts. */
export const PATCH = privateRoute(esimReferralCodeRoute);
