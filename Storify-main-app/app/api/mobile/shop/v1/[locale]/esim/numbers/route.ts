import { esimNumberShopRoute } from "@/lib/esim/mobile/number-shop";
import { privateRoute } from "@/lib/api-next/routes";

/** The eSIM module's numbers page (NUM-03): a guest gets the first page only; see lib/esim/mobile/number-shop.ts. */
export const GET = privateRoute(esimNumberShopRoute);
