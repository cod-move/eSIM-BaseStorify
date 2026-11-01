import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { esimStartDateVariants } from "@/lib/esim/cart";

/**
 * The product's variants a shopper may give a start date (ORD-03): every
 * supplier behind them schedules activation. Empty for any other product —
 * the product page's eSIM options then offer no date.
 */
export const GET = withApi<{ id: string }>(
  { auth: "optional", rateLimit: { action: "esim:start-dates", preset: "browse" } },
  async ({ params }) => successResponse(await esimStartDateVariants(params.id)),
);
