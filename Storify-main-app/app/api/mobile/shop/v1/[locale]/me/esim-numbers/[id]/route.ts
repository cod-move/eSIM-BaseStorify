import { myNumberRemarkRoute, myNumberRoute } from "@/lib/esim/mobile/numbers";
import { privateRoute } from "@/lib/api-next/routes";

/** One of the shopper's numbers (NUM-06/07); see lib/esim/mobile/numbers.ts. */
export const GET = privateRoute(myNumberRoute);
export const PATCH = privateRoute(myNumberRemarkRoute);
