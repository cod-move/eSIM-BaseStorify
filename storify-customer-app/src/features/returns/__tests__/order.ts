import type { Money, OrderDetail, OrderLine } from '@/contracts/mobile/shop/v1';

export function money(amount: number, formatted: string): Money {
  return { amount, currency: 'BDT', formatted };
}

export function line(index: number, quantity: number, returnable?: number): OrderLine {
  return {
    index,
    productId: `p-${index}`,
    name: `Item ${index}`,
    quantity,
    unitPrice: money(100, '৳100.00'),
    lineTotal: money(100 * quantity, `৳${100 * quantity}.00`),
    finalSale: false,
    returnableQuantity: returnable,
  };
}

/** An order of the shopper's, as the store sends it, with the lines given. */
export function order(lines: OrderLine[], returns: Partial<OrderDetail> = {}): OrderDetail {
  const zero = money(0, '৳0.00');
  return {
    id: 'o-1',
    number: '1003',
    status: 'delivered',
    paymentStatus: 'paid',
    paymentMethod: 'cod',
    placedAt: '2026-09-02T17:45:00Z',
    canCancel: false,
    lines,
    totals: { subtotal: zero, shipping: zero, tax: zero, discount: zero, total: zero },
    shipments: [],
    canReturn: lines.some((candidate) => (candidate.returnableQuantity ?? 0) > 0),
    ...returns,
  };
}
