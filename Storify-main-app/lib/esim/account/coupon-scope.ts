import "server-only";

import { getTranslations } from "next-intl/server";
import { Category, Product } from "@/models";
import { listDestinations, destinationPath } from "@/lib/esim/storefront/catalog";
import { localizeDestinations } from "@/lib/esim/storefront/destination-names";
import { NUMBER_PRODUCT_TYPE, NUMBER_TOPUP_PRODUCT_TYPE } from "@/lib/esim/numbers/product";
import { TOPUP_PRODUCT_TYPE } from "@/lib/esim/topup/product";
import { WALLET_PRODUCT_TYPE } from "@/lib/esim/wallet/product";
import { scopeLines, type CouponScope, type ScopeItem, type ScopeTranslate } from "@/lib/esim/account/coupon-scope-words";

/**
 * Which products a coupon is for, by name in the shopper's language, so My
 * coupons and the app's coupon list say "Only for: Japan eSIM, Thailand eSIM"
 * instead of "Selected products only". A destination's eSIM is named as its
 * page names it ("日本 eSIM"); the store's own hidden products (a number, a
 * top-up) by their translated names; anything else by the name the store gave
 * it. A product or category since deleted is left out.
 */

interface ScopedCoupon {
  _id: unknown;
  applicableProducts?: unknown[] | null;
  applicableCategories?: unknown[] | null;
  excludedProducts?: unknown[] | null;
}

/** The store's hidden products, named in the shopper's language; the numbers page is where a number is bought. */
const HIDDEN: Record<string, { key: string; fallback: string; href: string | null }> = {
  [NUMBER_PRODUCT_TYPE]: { key: "esim.coupons.products.number", fallback: "Phone number eSIM", href: "/esim/numbers" },
  [NUMBER_TOPUP_PRODUCT_TYPE]: { key: "esim.coupons.products.numberTopup", fallback: "Number top-up", href: null },
  [TOPUP_PRODUCT_TYPE]: { key: "esim.coupons.products.esimTopup", fallback: "eSIM top-up", href: null },
  [WALLET_PRODUCT_TYPE]: { key: "esim.coupons.products.walletTopup", fallback: "Wallet top-up", href: null },
};

const ids = (list: unknown[] | null | undefined) => (list ?? []).map(String).filter(Boolean);

async function translator(locale: string): Promise<ScopeTranslate> {
  const t = await getTranslations({ locale });
  return (key, fallback, values) => (t.has(key) ? t(key, values) : fallback);
}

/** Each coupon's scope (by coupon id), for the coupons that name products or categories. */
export async function couponScopes(coupons: readonly ScopedCoupon[], locale: string): Promise<Map<string, CouponScope>> {
  const scoped = coupons.filter((coupon) => ids(coupon.applicableProducts).length || ids(coupon.applicableCategories).length || ids(coupon.excludedProducts).length);
  if (!scoped.length) return new Map();
  const productIds = [...new Set(scoped.flatMap((coupon) => [...ids(coupon.applicableProducts), ...ids(coupon.excludedProducts)]))];
  const categoryIds = [...new Set(scoped.flatMap((coupon) => ids(coupon.applicableCategories)))];

  const [products, categories, t] = await Promise.all([
    productIds.length
      ? Product.find({ _id: { $in: productIds } }).select({ name: 1, slug: 1, productType: 1 }).lean<Array<{ _id: unknown; name?: string; slug?: string; productType?: string }>>()
      : [],
    categoryIds.length ? Category.find({ _id: { $in: categoryIds } }).select({ name: 1, slug: 1 }).lean<Array<{ _id: unknown; name?: string; slug?: string }>>() : [],
    translator(locale),
  ]);

  // A destination's eSIM, named as its page is.
  const destinations = new Map<string, ScopeItem>();
  if (products.some((product) => !HIDDEN[product.productType ?? ""])) {
    try {
      const wanted = new Set(products.map((product) => String(product._id)));
      const listed = (await listDestinations()).filter((destination) => wanted.has(destination.productId));
      for (const destination of await localizeDestinations(listed, locale)) {
        destinations.set(destination.productId, {
          name: t("esim.page.title", `${destination.name} eSIM`, { name: destination.name }),
          href: destinationPath(destination),
        });
      }
    } catch (error) {
      console.error("[esim] naming a coupon's destinations failed:", error);
    }
  }

  const items = new Map<string, ScopeItem>();
  for (const product of products) {
    const id = String(product._id);
    const hidden = HIDDEN[product.productType ?? ""];
    const item = hidden
      ? { name: t(hidden.key, hidden.fallback), href: hidden.href }
      : (destinations.get(id) ?? (product.name?.trim() ? { name: product.name.trim(), href: product.slug ? `/products/${product.slug}` : null } : null));
    if (item) items.set(`p:${id}`, item);
  }
  for (const category of categories) {
    if (category.name?.trim()) items.set(`c:${String(category._id)}`, { name: category.name.trim(), href: category.slug ? `/categories/${category.slug}` : null });
  }

  const pick = (keys: string[]) => keys.map((key) => items.get(key)).filter((item): item is ScopeItem => Boolean(item));
  return new Map(
    scoped.map((coupon) => [
      String(coupon._id),
      {
        only: pick([...ids(coupon.applicableProducts).map((id) => `p:${id}`), ...ids(coupon.applicableCategories).map((id) => `c:${id}`)]),
        notFor: pick(ids(coupon.excludedProducts).map((id) => `p:${id}`)),
      },
    ]),
  );
}

/** Each coupon's scope worded as condition lines (by coupon id): the app's coupon list. */
export async function couponScopeLines(coupons: readonly ScopedCoupon[], locale: string): Promise<Map<string, string[]>> {
  const [scopes, t] = await Promise.all([couponScopes(coupons, locale), translator(locale)]);
  return new Map([...scopes].map(([id, scope]) => [id, scopeLines(scope, locale, t)]));
}
