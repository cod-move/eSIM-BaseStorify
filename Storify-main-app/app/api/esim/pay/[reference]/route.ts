import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/api/errors";
import { getClientIP } from "@/lib/api/rate-limit-middleware";
import { appUrlForRequest } from "@/lib/app-url";
import { paymentPage, startPayment } from "@/lib/esim/payments/service";

/**
 * The eSIM payment page's data (PAY, patch P15). The checkout reference in
 * the path is the shopper's key: guests pay here too, so no sign-in.
 */
export const GET = withApi<{ reference: string }>(
  { auth: "optional", rateLimit: { action: "esim:pay:read", preset: "lenient" } },
  async ({ params }) => {
    const view = await paymentPage(params.reference);
    if (!view) throw new NotFoundError("Payment not found");
    return successResponse(view);
  },
);

const StartSchema = z.object({ method: z.string().trim().min(1).max(40), locale: z.string().trim().max(10).optional() });

/** Pay with one method: the answer is a page to go to or QR data to show. */
export const POST = withApi<{ reference: string }>(
  { auth: "optional", rateLimit: { action: "esim:pay:start", preset: "strict" } },
  async ({ request, params }) => {
    const body = StartSchema.parse(await request.json().catch(() => ({})));
    return successResponse(
      await startPayment(params.reference, body.method, {
        origin: appUrlForRequest(request),
        clientIp: getClientIP(request),
        userAgent: request.headers.get("user-agent") || "",
        locale: body.locale || "en",
      }),
    );
  },
);
