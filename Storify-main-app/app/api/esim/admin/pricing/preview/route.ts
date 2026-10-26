import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { validateBody } from "@/lib/api/validate";
import { previewPricing } from "@/lib/esim/admin/pricing";
import { PricingChangeSchema } from "@/lib/esim/admin/pricing-schema";
import { ESIM_READ } from "@/lib/esim/admin/route";

/** What a pricing change would do, before it is saved: how many prices move and the biggest moves. */
export const POST = withApi(
  { ...ESIM_READ, rateLimit: { action: "esim:admin:preview", preset: "moderate" } },
  async ({ request }) => successResponse(await previewPricing(await validateBody(request, PricingChangeSchema))),
);
