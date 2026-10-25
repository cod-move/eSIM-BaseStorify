import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { esimDayPricing } from "@/lib/esim/cart";

/**
 * The product's day-priced variants: price per day and the range of days,
 * by variant id (CAT, patch point P10). Empty for a product without any —
 * the product page's day picker then draws nothing.
 */
export const GET = withApi<{ id: string }>(
  { auth: "optional", rateLimit: { action: "esim:day-pricing", preset: "browse" } },
  async ({ params }) => successResponse(await esimDayPricing(params.id)),
);
