import { connectDB } from "@/lib/db";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ESIM_READ } from "@/lib/esim/admin/route";
import { ensureCategory } from "@/lib/esim/catalog/category";
import { ensureNumberProduct } from "@/lib/esim/numbers/product";
import { listDestinations } from "@/lib/esim/storefront/catalog";

/**
 * What the admin's discount form can limit a coupon to (patch P67): the eSIM
 * destinations (their products), the number-card product and the eSIM
 * category. Made on first use when missing, so a choice always has something
 * to point at.
 */
export const GET = withApi(ESIM_READ, async () => {
  await connectDB();
  const [destinations, number, category] = await Promise.all([
    listDestinations(),
    ensureNumberProduct().catch(() => null),
    ensureCategory().catch(() => null),
  ]);
  return successResponse({
    numberProductId: number?.productId ?? null,
    esimCategoryId: category ? String(category) : null,
    destinations: destinations
      .map((destination) => ({ productId: destination.productId, name: destination.name, scope: destination.scope, emoji: destination.emoji }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  });
});
