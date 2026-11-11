import { myNumberTopupQuoteRoute } from "@/lib/esim/mobile/numbers";
import { privateRoute } from "@/lib/api-next/routes";

/** Credit or a data package for a number as a cart line (NUM-08/09); see lib/esim/mobile/numbers.ts. */
export const POST = privateRoute(myNumberTopupQuoteRoute);
