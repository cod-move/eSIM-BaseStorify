/**
 * The payment fee (patch P29) shown as a charge of its own beside shipping,
 * not as an item (patch P30). The fee stays a line of the cart and the order,
 * which their totals, refunds and the ledger count; only what lists the items
 * to a person leaves it out and prints it as a row. Pure; safe in the browser.
 */

type Line = { lineAttributes?: unknown; price?: number; quantity?: number };

/** Whether a cart or order line is the payment fee. */
export function isPaymentFeeLine(line: object | null | undefined): boolean {
  const attributes = (line as { lineAttributes?: unknown } | null | undefined)?.lineAttributes;
  return Boolean(attributes && typeof attributes === "object" && (attributes as { paymentFee?: unknown }).paymentFee);
}

const cents = (line: Line) => Math.round(Number(line.price ?? 0) * 100) * Number(line.quantity ?? 1);

/** What the fee lines among `lines` come to, in the store's units. */
export function paymentFeeIn(lines: readonly Line[] | null | undefined): number {
  return (lines ?? []).filter(isPaymentFeeLine).reduce((sum, line) => sum + cents(line), 0) / 100;
}

/**
 * A cart view without its fee line, for the cart, the drawer and the app: the
 * checkout shows the fee as a row, from the method chosen there.
 */
export function withoutPaymentFee<V extends { lines: Array<{ item: Line }>; totalItems: number; subtotal: number }>(view: V): V {
  const fees = view.lines.filter((line) => isPaymentFeeLine(line.item));
  if (!fees.length) return view;
  const feeCents = fees.reduce((sum, line) => sum + cents(line.item), 0);
  return {
    ...view,
    lines: view.lines.filter((line) => !isPaymentFeeLine(line.item)),
    totalItems: view.totalItems - fees.reduce((sum, line) => sum + Number(line.item.quantity ?? 1), 0),
    subtotal: Math.round(view.subtotal * 100 - feeCents) / 100,
  };
}
