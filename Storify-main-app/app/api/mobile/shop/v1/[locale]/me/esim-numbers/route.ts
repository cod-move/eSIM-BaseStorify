import { myNumbersRoute } from "@/lib/esim/mobile/numbers";
import { privateRoute } from "@/lib/api-next/routes";

/** The shopper's numbers (NUM-06); see lib/esim/mobile/numbers.ts. */
export const GET = privateRoute(myNumbersRoute);
