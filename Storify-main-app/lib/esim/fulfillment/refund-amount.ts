/**
 * What a shopper paid for some units of an order, for refunding eSIMs that
 * could not be issued (ORD-09). Pure.
 *
 * A unit's share of the order total is its line price over the sum of line
 * prices, so order-level discounts, tax and any delivery charge are spread in
 * proportion — what the shopper actually paid, not the list price. Cents are
 * rounded down per unit, and the total is held to what is still refundable.
 */

export interface RefundInput {
  total: number;
  items: Array<{ price: number; quantity: number }>;
  /** Line index of each unit to refund (one entry per unit). */
  units: number[];
  /** Collected and not yet refunded on the order. */
  refundable: number;
}

export function refundAmount(input: RefundInput): number {
  const lineSum = input.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (!(lineSum > 0) || !(input.total > 0) || !(input.refundable > 0)) return 0;
  const ratio = input.total / lineSum;
  const cents = input.units.reduce((sum, lineIndex) => {
    const price = input.items[lineIndex]?.price ?? 0;
    return sum + Math.floor(price * ratio * 100 + 1e-6);
  }, 0);
  // Everything left on the order failed: refund it to the cent, rounding included.
  const everyUnit = input.units.length === input.items.reduce((sum, item) => sum + item.quantity, 0);
  const amount = everyUnit ? input.refundable : cents / 100;
  return Math.round(Math.min(amount, input.refundable) * 100) / 100;
}
