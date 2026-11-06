import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { connectDB } from "@/lib/db";
import { storeCreditHistory, storeCreditSummary } from "@/lib/store-credit/store-credit";
import { withCreditKinds, withCreditParts, withOrderNumbers } from "@/lib/esim/wallet/credit-history"; // [esim-patch] P38
import { getEsimSettings } from "@/models/esim-pricing.model"; // [esim-patch] P38

/**
 * The shopper's own store credit (R8): what they can spend in each currency,
 * the part that expires next, and what added to it or took from it.
 */
export const GET = withApi(
  { auth: "user", rateLimit: { action: "user:store-credit", preset: "lenient" } },
  async ({ session }) => {
    await connectDB();
    // [esim-patch] P38 the balance split by where it came from, each row's order number and part, and whether topping up is on.
    const [balances, history, esimSettings] = await Promise.all([
      storeCreditSummary(session.user.id).then((list) => withCreditParts(session.user.id, list)),
      storeCreditHistory(session.user.id, { limit: 50 }).then(withOrderNumbers).then(withCreditKinds),
      getEsimSettings(),
    ]);
    return successResponse({ balances, history, walletTopup: Boolean(esimSettings.wallet?.enabled) });
  },
);
