import { esimNumberQuoteRoute } from "@/lib/esim/mobile/number-shop";
import { privateRoute } from "@/lib/api-next/routes";

/** A number as a cart line (NUM-03/04); see lib/esim/mobile/number-shop.ts. */
export const POST = privateRoute(esimNumberQuoteRoute);
