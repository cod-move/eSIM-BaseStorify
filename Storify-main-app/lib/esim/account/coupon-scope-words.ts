/**
 * The products a coupon is for, worded (My coupons, the app's coupon list).
 * Pure, so the tests can use it; lib/esim/account/coupon-scope.ts finds the
 * names.
 */

export interface ScopeItem {
  name: string;
  /** The page the product or category lives at; null for one shoppers cannot open (a number top-up). */
  href: string | null;
}

export interface CouponScope {
  /** The products and categories it applies to; empty for every product. */
  only: ScopeItem[];
  /** The products it never applies to. */
  notFor: ScopeItem[];
}

/** Names listed before the rest is counted ("and 3 more"). */
export const SCOPE_NAMES_SHOWN = 5;

export type ScopeTranslate = (key: string, fallback: string, values?: Record<string, string>) => string;

function fill(text: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((out, [name, value]) => out.replaceAll(`{${name}}`, value), text);
}

/** "Japan eSIM, Thailand eSIM and 3 more", in the locale's own list style. */
export function scopeList(items: readonly ScopeItem[], locale: string, t: ScopeTranslate): string {
  const names = items.slice(0, SCOPE_NAMES_SHOWN).map((item) => item.name);
  const rest = items.length - names.length;
  if (rest > 0) names.push(t("esim.coupons.more", fill("{count} more", { count: String(rest) }), { count: String(rest) }));
  try {
    return new Intl.ListFormat(locale, { type: "conjunction" }).format(names);
  } catch {
    return names.join(", ");
  }
}

/** The scope as lines: "Only for: …", "Not for: …". None for a coupon on every product. */
export function scopeLines(scope: CouponScope | undefined, locale: string, t: ScopeTranslate): string[] {
  if (!scope) return [];
  const lines: string[] = [];
  if (scope.only.length) {
    const items = scopeList(scope.only, locale, t);
    lines.push(t("esim.coupons.onlyFor", fill("Only for: {items}", { items }), { items }));
  }
  if (scope.notFor.length) {
    const items = scopeList(scope.notFor, locale, t);
    lines.push(t("esim.coupons.notFor", fill("Not for: {items}", { items }), { items }));
  }
  return lines;
}
