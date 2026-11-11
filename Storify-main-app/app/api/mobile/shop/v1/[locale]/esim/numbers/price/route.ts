import { esimNumberPriceRoute } from "@/lib/esim/mobile/number-shop";
import { publicGet } from "@/lib/api-next/routes";

/** What a number choice comes to (NUM-03/08); see lib/esim/mobile/number-shop.ts. */
export const GET = publicGet(esimNumberPriceRoute);
