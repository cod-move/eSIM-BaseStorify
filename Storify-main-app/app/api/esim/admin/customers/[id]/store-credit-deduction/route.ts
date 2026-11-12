import * as z from "zod";
import { connectDB, mongoose } from "@/lib/db";
import { CustomerProfile, User } from "@/models";
import { getSettings } from "@/models/settings.model";
import { AuthorizationError, NotFoundError, ValidationError } from "@/lib/api/errors";
import { successResponse } from "@/lib/api/response";
import { validateBody } from "@/lib/api/validate";
import { withApi } from "@/lib/api/handler";
import { canIssueRefunds } from "@/lib/access/rbac";
import { createAuditContext } from "@/lib/audit";
import { storeCreditSummary } from "@/lib/store-credit/store-credit";
import { deductStoreCredit } from "@/lib/esim/wallet/admin-deduct";
import { MAX_DEDUCTION_MINOR } from "@/lib/esim/wallet/deduct-policy";

const DeductSchema = z.object({
  /** Cents of the store's currency (USD): a whole number, never floating point. */
  amountMinor: z.number().int().min(1).max(MAX_DEDUCTION_MINOR),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "Choose a currency"),
  reason: z.string().trim().min(1, "Say why the balance is deducted").max(500),
  /** One per opening of the dialog, so a double click deducts once. */
  requestId: z.string().trim().min(8).max(100),
});

/**
 * Take money off a customer's store credit (patch P62): the admin customer
 * page's Store credit tab → Deduct. Only those who may give credit (admins,
 * as Storify's own "Give credit"). `id` is the CustomerProfile id.
 */
export const POST = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:admin:store-credit:deduct", preset: "moderate" } },
  async ({ request, params, session }) => {
    if (!canIssueRefunds(session.user)) throw new AuthorizationError("Only admins can deduct store credit");
    const body = await validateBody(request, DeductSchema);
    await connectDB();
    if (!mongoose.isValidObjectId(params.id)) throw new NotFoundError("Customer not found");
    const profile = await CustomerProfile.findById(params.id).select("userId").lean<{ userId?: unknown } | null>();
    const userId = String(profile?.userId || "");
    if (!mongoose.isValidObjectId(userId)) throw new NotFoundError("Customer not found");

    const settings = await getSettings();
    const currency = body.currency.toUpperCase();
    const storeCurrency = String(settings.general?.defaultCurrency || "USD").toUpperCase();
    if (currency !== storeCurrency) throw new ValidationError(`Store credit is kept in the store's currency, ${storeCurrency}`);

    const user = await User.findById(userId).select("email name").lean<{ email?: string; name?: string } | null>();
    const { row, created } = await deductStoreCredit({
      customerId: userId,
      currency,
      amountMinor: body.amountMinor,
      reason: body.reason,
      adminId: session.user.id,
      idempotencyKey: `admin-deduct:${userId}:${body.requestId}`,
      audit: createAuditContext(request, session),
      customerLabel: user?.email || user?.name || null,
    });
    return successResponse({ row, created, balances: await storeCreditSummary(userId) });
  },
);
