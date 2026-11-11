import { esimNumberShopRoute } from "@/lib/esim/mobile/number-shop";
import { publicGet } from "@/lib/api-next/routes";

/** The eSIM module's numbers page (NUM-03); see lib/esim/mobile/number-shop.ts. */
export const GET = publicGet(esimNumberShopRoute);
