/**
 * Which items a store coupon applies to, as the admin's discount form picks
 * it (patch P67), in Storify's own coupon fields — `applicableProducts` and
 * `applicableCategories`, which checkout already honours
 * (lib/catalog/coupons.ts). Pure, both ways.
 *
 *  - all: no restriction.
 *  - numbers: the number-card product only.
 *  - travel: the eSIM category, so a destination added later is included.
 *  - destinations: the chosen destinations' products.
 *  - custom: anything else already on a coupon (other products or
 *    categories): kept as it is.
 */
export type CouponScopeMode = "all" | "numbers" | "travel" | "destinations" | "custom";

export interface CouponScopeOptions {
  numberProductId: string | null;
  esimCategoryId: string | null;
  destinationProductIds: string[];
}

export interface CouponScopeValue {
  applicableProducts: string[];
  applicableCategories: string[];
}

export function scopeModeOf(value: CouponScopeValue, options: CouponScopeOptions): CouponScopeMode {
  const products = value.applicableProducts;
  const categories = value.applicableCategories;
  if (!products.length && !categories.length) return "all";
  if (!products.length && categories.length === 1 && categories[0] === options.esimCategoryId) return "travel";
  if (!categories.length && products.length === 1 && products[0] === options.numberProductId) return "numbers";
  const destinations = new Set(options.destinationProductIds);
  if (!categories.length && products.every((id) => destinations.has(id))) return "destinations";
  return "custom";
}

/** The coupon's fields for a mode; `chosen` are the destinations' product ids. Null: the mode cannot be set (nothing to point at). */
export function scopeValueOf(
  mode: Exclude<CouponScopeMode, "custom">,
  options: CouponScopeOptions,
  chosen: string[] = [],
): CouponScopeValue | null {
  switch (mode) {
    case "all":
      return { applicableProducts: [], applicableCategories: [] };
    case "numbers":
      return options.numberProductId ? { applicableProducts: [options.numberProductId], applicableCategories: [] } : null;
    case "travel":
      return options.esimCategoryId ? { applicableProducts: [], applicableCategories: [options.esimCategoryId] } : null;
    case "destinations":
      return { applicableProducts: [...new Set(chosen)], applicableCategories: [] };
  }
}
