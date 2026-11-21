import "server-only";

import { mongoose } from "@/lib/db";
import { Coupon, User, Vendor } from "@/models";
import { CouponStatus, CouponType } from "@/models/coupon.model";
import { CouponRefusedError, assertCouponOpenToShopper, type CouponDocument } from "@/lib/catalog/coupons";
import { getCouponCopy } from "@/lib/catalog/coupon-copy";
import { formatCurrency } from "@/lib/intl/money";
import { getStoreCurrency } from "@/lib/intl/server-currency";

/**
 * My coupons (account menu): the codes this shopper may use — the ones the
 * store shows to shoppers (Discounts → "Show to shoppers") and the ones made
 * for them alone (a referral welcome coupon) — judged and worded as the
 * shopper app's coupon list (GET /coupons) judges them, without a cart.
 */

export interface MyCoupon {
  code: string;
  title: string | null;
  /** "15% off", "$5.00 off", "Free shipping". */
  benefit: string;
  /** Each already worded: minimum spend, cap, seller, once per customer, end date. */
  conditions: string[];
  /** Only for this shopper (not shown to everyone). */
  personal: boolean;
  usable: boolean;
  /** Why not, when not usable (used already, not started yet…). */
  reason: string | null;
  endsAt: string | null;
}

const MAX = 50;

export async function myCoupons(userId: string, locale: string): Promise<MyCoupon[]> {
  const user = await User.findById(userId).select({ email: 1 }).lean<{ email?: string } | null>();
  const email = user?.email?.toLowerCase();
  const coupons: CouponDocument[] = await Coupon.find({
    $or: [
      { listed: true },
      { restrictedToUserId: new mongoose.Types.ObjectId(userId) },
      ...(email ? [{ restrictedToEmail: email }] : []),
    ],
    status: CouponStatus.ACTIVE,
    endDate: { $gte: new Date() },
  })
    .sort({ endDate: 1 })
    .limit(MAX);
  const [copy, currency] = await Promise.all([getCouponCopy(locale), getStoreCurrency()]);
  const sellerIds = [...new Set(coupons.map((coupon) => (coupon.vendorId ? String(coupon.vendorId) : "")).filter(Boolean))];
  const sellers = sellerIds.length
    ? new Map(
        (await Vendor.find({ _id: { $in: sellerIds } }).select("storeName").lean<Array<{ _id: unknown; storeName?: string }>>())
          .filter((vendor) => vendor.storeName?.trim())
          .map((vendor) => [String(vendor._id), vendor.storeName!.trim()]),
      )
    : new Map<string, string>();
  const say = (amount: number) => formatCurrency(amount, currency.code, currency.locale);

  const rows = await Promise.all(
    coupons.map(async (coupon): Promise<MyCoupon | null> => {
      let usable = true;
      let reason: string | null = null;
      try {
        await assertCouponOpenToShopper(coupon, { userId, ...(email ? { email } : {}) });
      } catch (error) {
        if (!(error instanceof CouponRefusedError)) throw error;
        // A code made for someone else reads as no code at all: not this shopper's to see.
        if (error.refusal === "NOT_FOUND") return null;
        usable = false;
        reason = copy.refusal(error.refusal, error.facts.startsAt ? { startsAt: error.facts.startsAt } : {});
      }
      const minimum = Number(coupon.minOrderAmount) || 0;
      const percent = coupon.type !== CouponType.FIXED && coupon.type !== CouponType.FREE_SHIPPING;
      const cap = percent && Number(coupon.maxDiscount) > 0 ? Number(coupon.maxDiscount) : 0;
      const seller = coupon.vendorId ? sellers.get(String(coupon.vendorId)) : undefined;
      const conditions: string[] = [];
      if (minimum > 0) conditions.push(copy.minOrder(say(minimum)));
      if (cap > 0) conditions.push(copy.maxDiscount(say(cap)));
      if (seller) conditions.push(copy.sellerOnly(seller));
      if (coupon.applicableProducts?.length || coupon.applicableCategories?.length || coupon.excludedProducts?.length) conditions.push(copy.selectedProducts());
      if (coupon.perUserLimit && coupon.perUserLimit > 0) conditions.push(copy.perCustomer(coupon.perUserLimit));
      if (coupon.endDate) conditions.push(copy.ends(new Date(coupon.endDate)));
      return {
        code: coupon.code,
        title: coupon.label?.trim() || null,
        benefit:
          coupon.type === CouponType.FREE_SHIPPING
            ? copy.offerFreeShipping()
            : coupon.type === CouponType.FIXED
              ? copy.offerFixed(say(coupon.value))
              : copy.offerPercent(coupon.value),
        conditions,
        personal: Boolean(coupon.restrictedToUserId || coupon.restrictedToEmail),
        usable,
        reason,
        endsAt: coupon.endDate ? new Date(coupon.endDate).toISOString() : null,
      };
    }),
  );
  // Usable first; within each, the soonest end first (the query's order).
  return rows.filter((row): row is MyCoupon => row !== null).sort((a, b) => Number(b.usable) - Number(a.usable));
}
