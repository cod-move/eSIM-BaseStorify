import { esimTopupQuoteRoute } from "@/lib/esim/mobile/topups";
import { privateRoute } from "@/lib/api-next/routes";

/** The eSIM module's top-up quote (APP-06); see lib/esim/mobile/topups.ts. */
export const POST = privateRoute(esimTopupQuoteRoute);
