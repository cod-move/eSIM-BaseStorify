import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { validateBody } from "@/lib/api/validate";
import { connectDB } from "@/lib/db";
import { syncPaymentFeeLine } from "@/lib/esim/payments/fee-line";

const MethodSchema = z.object({ method: z.string().min(1).max(40) });

/**
 * Keeps the cart's payment fee line in step with the method chosen at
 * checkout (patch P29), for a guest's cart too; the checkout reads the cart
 * again when it changed. The order is priced the same way when it is placed.
 */
export const POST = withApi(
  { auth: "optional", rateLimit: { action: "esim:payment-fee", preset: "moderate" } },
  async ({ request, session }) => {
    const { method } = await validateBody(request, MethodSchema);
    const sessionId = request.cookies.get("cart_session")?.value;
    const query = session?.user?.id ? { userId: session.user.id } : sessionId ? { sessionId } : null;
    if (!query) return successResponse({ changed: false, feeMinor: 0 });
    await connectDB();
    return successResponse(await syncPaymentFeeLine(query, method));
  },
);
