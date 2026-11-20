import { esimRewardsRoute } from "@/lib/esim/mobile/rewards";
import { privateRoute } from "@/lib/api-next/routes";

/** The rewards centre (福利中心); see lib/esim/mobile/rewards.ts. */
export const GET = privateRoute(esimRewardsRoute);
