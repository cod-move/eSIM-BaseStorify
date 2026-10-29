/**
 * The money side of a sale snapshot (ORD-04). Pure.
 *
 * A unit's price is its share of what the order was charged: the line price
 * over the sum of line prices, times the order total, so order discounts and
 * tax are spread the same way refunds spread them (fulfillment/refund-amount).
 */

export interface OrderMoney {
  total: number;
  items: Array<{ price: number; quantity: number }>;
}

/** What the shopper paid for one unit of a line, in cents. */
export function unitSaleMinor(order: OrderMoney, lineIndex: number): number {
  const lineSum = order.items.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0);
  const price = order.items[lineIndex]?.price ?? 0;
  if (!(lineSum > 0) || !(order.total > 0) || !(price > 0)) return 0;
  return Math.floor(price * (order.total / lineSum) * 100 + 1e-6);
}

/** What the supplier charges for one purchase: a per-day cost times the days bought. */
export function purchaseCostMinor(
  cost: { amountMinor: number; billingUnit?: "plan" | "day" },
  days: number | null,
): number {
  if (cost.billingUnit === "day") return cost.amountMinor * Math.max(1, days ?? 1);
  return cost.amountMinor;
}

/** A supplier amount in USD cents at a known rate; null without one. */
export function usdMinorOf(amountMinor: number, usdPerUnit: number | null | undefined): number | null {
  if (!(typeof usdPerUnit === "number" && usdPerUnit > 0)) return null;
  return Math.round(amountMinor * usdPerUnit);
}
