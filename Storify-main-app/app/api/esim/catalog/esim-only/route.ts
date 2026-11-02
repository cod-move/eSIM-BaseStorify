import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { connectDB, mongoose } from "@/lib/db";
import { isEsimOnlyCart } from "@/lib/esim/checkout/address";

/**
 * Whether these products are all eSIMs, eSIM top-ups or balance top-ups
 * (`?ids=a,b`): checkout then asks for no address (patch P28). Guests too.
 */
export const GET = withApi(
  { auth: "optional", rateLimit: { action: "esim:esim-only", preset: "browse" } },
  async ({ request }) => {
    const ids = (new URL(request.url).searchParams.get("ids") ?? "")
      .split(",")
      .filter((id) => mongoose.isValidObjectId(id))
      .slice(0, 100);
    await connectDB();
    return successResponse({ esimOnly: await isEsimOnlyCart(ids.map((productId) => ({ productId }))) });
  },
);
