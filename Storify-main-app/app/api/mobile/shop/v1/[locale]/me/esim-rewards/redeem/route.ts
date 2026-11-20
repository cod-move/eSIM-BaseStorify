import { esimRewardsRedeemRoute } from "@/lib/esim/mobile/rewards";
import { privateRoute } from "@/lib/api-next/routes";

/** Exchanging saved data for an eSIM; see lib/esim/mobile/rewards.ts. */
export const POST = privateRoute(esimRewardsRedeemRoute);
