import { esimRewardsTelegramLinkRoute, esimRewardsTelegramUnlinkRoute } from "@/lib/esim/mobile/rewards";
import { privateRoute } from "@/lib/api-next/routes";

/** Linking Telegram for check-ins, and unlinking it; see lib/esim/mobile/rewards.ts. */
export const POST = privateRoute(esimRewardsTelegramLinkRoute);
export const DELETE = privateRoute(esimRewardsTelegramUnlinkRoute);
