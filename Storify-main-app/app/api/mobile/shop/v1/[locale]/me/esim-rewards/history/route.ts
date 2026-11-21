import { esimRewardsHistoryRoute } from "@/lib/esim/mobile/rewards";
import { privateRoute } from "@/lib/api-next/routes";

/** The rewards history, a page at a time; see lib/esim/mobile/rewards.ts. */
export const GET = privateRoute(esimRewardsHistoryRoute);
