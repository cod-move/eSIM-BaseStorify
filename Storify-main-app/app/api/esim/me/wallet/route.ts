import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { validateBody } from "@/lib/api/validate";
import { connectDB } from "@/lib/db";
import { Cart } from "@/models";
import { getEsimSettings } from "@/models/esim-pricing.model";
import { isWalletCart, parkCartForTopup, restoreParkedCart } from "@/lib/esim/wallet/park";

const ActionSchema = z.object({ action: z.enum(["park", "restore"]) });

/**
 * Topping up in the middle of a checkout (WAL-01). `park` sets the cart's
 * other lines aside before the top-up goes in; `restore` puts them back
 * unless the top-up is still in the cart. Both answer what checkout needs:
 * whether adding money is on, and whether the cart is a top-up.
 */
export const POST = withApi(
  { auth: "user", rateLimit: { action: "esim:wallet:park", preset: "moderate" } },
  async ({ request, session }) => {
    const { action } = await validateBody(request, ActionSchema);
    await connectDB();
    const userId = session.user.id;
    const moved = action === "park" ? await parkCartForTopup(userId) : await restoreParkedCart(userId);
    const [settings, cart] = await Promise.all([
      getEsimSettings(),
      Cart.findOne({ userId }).select({ items: 1 }).lean<{ items: Array<{ variantId?: unknown }> } | null>(),
    ]);
    return successResponse({
      moved,
      walletEnabled: Boolean(settings.wallet?.enabled),
      walletCart: await isWalletCart(cart?.items ?? []),
    });
  },
);
