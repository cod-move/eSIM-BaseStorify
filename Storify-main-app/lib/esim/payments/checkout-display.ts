/**
 * How checkout shows its payment methods (patch P34): the order of the rows,
 * the one chosen to begin with, and an uploaded icon per method — for
 * Storify's own methods and each eSIM method alike, set on Storify's payment
 * settings page. Methods are named as checkout values them ("card", "cod",
 * "extension:stripe"). Pure; safe in the browser.
 *
 * The account balance ("store_credit", patch P27) stays first and is chosen
 * whenever it covers the order: it is not one of the methods arranged here.
 */

export interface CheckoutDisplay {
  /** Method values, first shown first; a method not listed follows those that are, as before. */
  order: string[];
  /** Chosen when checkout opens, if it can take the order. */
  defaultMethod: string | null;
  /** Method value → image URL. */
  icons: Record<string, string>;
}

export const EMPTY_CHECKOUT_DISPLAY: CheckoutDisplay = { order: [], defaultMethod: null, icons: {} };

const PINNED_FIRST = "store_credit";

/** Where a method goes: its place in the order, or after every listed one. */
export function displayRank(display: CheckoutDisplay | null | undefined, method: string): number {
  if (method === PINNED_FIRST) return -1;
  const index = display?.order.indexOf(method) ?? -1;
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

/** The rows in the admin's order; the sort is stable, so unlisted ones keep checkout's own order. */
export function arrangeMethods<T extends { value: string }>(rows: readonly T[], display: CheckoutDisplay | null | undefined): T[] {
  return rows
    .map((row, index) => ({ row, index, rank: displayRank(display, row.value) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.row);
}

/**
 * The shopper app lists the eSIM methods as one entry, "extension" (patch
 * P15): it goes where the first eSIM method is.
 */
export function appDisplayRank(display: CheckoutDisplay | null | undefined, id: string): number {
  if (id !== "extension") return displayRank(display, id);
  const index = display?.order.findIndex((method) => method.startsWith("extension:")) ?? -1;
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

/** An icon URL is a site path or an https address: nothing else reaches an <img>. */
export function isIconUrl(url: unknown): url is string {
  return typeof url === "string" && url.length <= 1000 && (/^\/[^/\\]/.test(url) || /^https:\/\/[^\s"'<>]+$/i.test(url));
}
