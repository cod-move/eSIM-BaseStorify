/**
 * A number's price with its discount (NUM-03): an admin may set a discount
 * price below the number's price; the number then sells at it and its price
 * shows struck through. The memorable-number premium is never discounted.
 * Pure, for the shop, the cart and the admin alike.
 */

export interface NumberPriceFields {
  priceMinor: number;
  salePriceMinor?: number | null;
}

/** The discount price when it is set and below the price; otherwise none. */
export function numberDiscountMinor(row: NumberPriceFields): number | null {
  const sale = row.salePriceMinor;
  return typeof sale === "number" && Number.isInteger(sale) && sale >= 0 && sale < row.priceMinor ? sale : null;
}

/** What the number itself sells for (its premium not included). */
export function numberSellingMinor(row: NumberPriceFields): number {
  return numberDiscountMinor(row) ?? row.priceMinor;
}

export interface NumberPriceChange {
  priceMinor?: number;
  /** null takes the discount away. */
  salePriceMinor?: number | null;
  premiumMinor?: number;
}

/**
 * The fields a change sets on one number, or why it cannot: a discount must
 * stay below the price it ends with. An unchanged discount that a lower
 * price leaves at or above it is taken away instead of refused, so cutting
 * the price of many numbers at once never stops on one of them.
 */
export function applyNumberPriceChange(
  row: { priceMinor: number; salePriceMinor?: number | null },
  change: NumberPriceChange,
): { set: { priceMinor?: number; salePriceMinor?: number | null; premiumMinor?: number } } | { problem: "discount" } {
  const set: { priceMinor?: number; salePriceMinor?: number | null; premiumMinor?: number } = {};
  if (change.priceMinor !== undefined) set.priceMinor = change.priceMinor;
  if (change.premiumMinor !== undefined) set.premiumMinor = change.premiumMinor;
  const price = change.priceMinor ?? row.priceMinor;
  if (change.salePriceMinor !== undefined) {
    if (change.salePriceMinor !== null && change.salePriceMinor >= price) return { problem: "discount" };
    set.salePriceMinor = change.salePriceMinor;
  } else if (row.salePriceMinor != null && row.salePriceMinor >= price) {
    set.salePriceMinor = null;
  }
  return { set };
}
