/** The mock store's data for: orders. Every mock shopper has the same history. */
import type {
  OrderDetail,
  OrderLine,
  OrderShipment,
  OrderSummary,
  OrderTracking,
} from '@/contracts/mobile/shop/v1';

import { SEEDS } from './products';
import { money, picture } from './shared';

type LineSeed = { slug: string; quantity: number; variant?: string; vendor?: string };

type OrderSeed = {
  id: string;
  number: string;
  status: string;
  placedAt: string;
  paymentStatus: string;
  paymentMethod: string;
  lines: LineSeed[];
  tracking?: OrderTracking;
  /** On an order two sellers ship: each seller's part, by vendor name. */
  shipments?: (Omit<OrderShipment, 'lineIndexes'> & { vendorName: string })[];
  cancelledAt?: string;
  note?: string;
};

const COURIER = 'Swift Parcel';
const COURIER_URL = 'https://example.com/track/';

const SEED_ORDERS: OrderSeed[] = [
  {
    id: 'ord_1006',
    number: '1006',
    status: 'pending',
    placedAt: '2026-10-01T09:12:00Z',
    paymentStatus: 'pending',
    paymentMethod: 'cod',
    lines: [{ slug: 'trail-running-shoes', quantity: 1 }],
    note: 'Please call before delivery.',
  },
  {
    id: 'ord_1005',
    number: '1005',
    status: 'shipped',
    placedAt: '2026-09-27T14:40:00Z',
    paymentStatus: 'paid',
    paymentMethod: 'stripe',
    lines: [
      { slug: 'canvas-weekender-bag', quantity: 1 },
      { slug: 'everyday-cotton-tee', quantity: 2, variant: 'White / M' },
    ],
    tracking: {
      number: 'PX4821937',
      carrier: COURIER,
      url: `${COURIER_URL}PX4821937`,
      events: [
        { at: '2026-09-30T08:05:00Z', status: 'Out for delivery', location: 'Dhanmondi hub' },
        { at: '2026-09-29T19:30:00Z', status: 'Arrived at hub', location: 'Dhaka sorting centre' },
        { at: '2026-09-28T11:15:00Z', status: 'Picked up', location: 'Seller warehouse' },
      ],
    },
  },
  {
    id: 'ord_1004',
    number: '1004',
    status: 'processing',
    placedAt: '2026-09-21T10:02:00Z',
    paymentStatus: 'paid',
    paymentMethod: 'paypal',
    lines: [
      { slug: 'trail-running-shoes', quantity: 1, vendor: 'North Trail' },
      { slug: 'canvas-weekender-bag', quantity: 1, vendor: 'Urban Loft' },
    ],
    shipments: [
      {
        vendorName: 'North Trail',
        status: 'delivered',
        shippedAt: '2026-09-22T09:00:00Z',
        deliveredAt: '2026-09-24T16:20:00Z',
        tracking: {
          number: 'NT-55120',
          carrier: COURIER,
          url: `${COURIER_URL}NT-55120`,
          events: [
            { at: '2026-09-24T16:20:00Z', status: 'Delivered', location: 'Gulshan' },
            { at: '2026-09-22T09:00:00Z', status: 'Picked up', location: 'North Trail' },
          ],
        },
      },
      { vendorName: 'Urban Loft', status: 'processing' },
    ],
  },
  {
    id: 'ord_1003',
    number: '1003',
    status: 'delivered',
    placedAt: '2026-09-02T17:45:00Z',
    paymentStatus: 'paid',
    paymentMethod: 'cod',
    lines: [{ slug: 'everyday-cotton-tee', quantity: 3, variant: 'Sage / L' }],
    tracking: {
      number: 'PX3310045',
      carrier: COURIER,
      url: `${COURIER_URL}PX3310045`,
      events: [
        { at: '2026-09-05T13:10:00Z', status: 'Delivered', location: 'Mirpur' },
        { at: '2026-09-04T07:40:00Z', status: 'Out for delivery', location: 'Mirpur hub' },
        { at: '2026-09-03T12:00:00Z', status: 'Picked up', location: 'Seller warehouse' },
      ],
    },
  },
  {
    id: 'ord_1002',
    number: '1002',
    status: 'cancelled',
    placedAt: '2026-08-18T08:30:00Z',
    cancelledAt: '2026-08-18T12:05:00Z',
    paymentStatus: 'refunded',
    paymentMethod: 'stripe',
    lines: [{ slug: 'canvas-weekender-bag', quantity: 1 }],
  },
];

/** The orders as the store keeps them now: cancelling one changes it here. */
let orders = SEED_ORDERS.map((order) => ({ ...order }));

export function resetOrders(): void {
  orders = SEED_ORDERS.map((order) => ({ ...order }));
}

export function findOrder(id: string): OrderSeed | undefined {
  return orders.find((order) => order.id === id);
}

export function listOrders(): OrderSeed[] {
  return orders;
}

/** As the store would: pending, no parcel out, nothing in flight. */
export function canCancel(order: OrderSeed): boolean {
  return order.status === 'pending' || order.status === 'preordered';
}

export function cancel(order: OrderSeed, at: string): void {
  order.status = 'cancelled';
  order.cancelledAt = at;
  if (order.paymentStatus === 'paid') order.paymentStatus = 'refunded';
}

function buildLines(order: OrderSeed, locale: string): OrderLine[] {
  return order.lines.map((line, index) => {
    const seed = SEEDS.find((candidate) => candidate.slug === line.slug) ?? SEEDS[0]!;
    return {
      index,
      productId: seed.slug,
      slug: seed.slug,
      variantId: line.variant ? `${seed.slug}-${index}` : undefined,
      name: line.variant ? `${seed.name} (${line.variant})` : seed.name,
      image: picture(seed.slug, seed.name),
      sku: `SKU-${seed.slug.slice(0, 6).toUpperCase()}`,
      quantity: line.quantity,
      unitPrice: money(seed.price, locale),
      lineTotal: money(seed.price * line.quantity, locale),
      finalSale: false,
    };
  });
}

function subtotalOf(order: OrderSeed): number {
  return order.lines.reduce((sum, line) => {
    const seed = SEEDS.find((candidate) => candidate.slug === line.slug) ?? SEEDS[0]!;
    return sum + seed.price * line.quantity;
  }, 0);
}

const SHIPPING = 5;

export function toSummary(order: OrderSeed, locale: string): OrderSummary {
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    placedAt: order.placedAt,
    itemCount: order.lines.reduce((sum, line) => sum + line.quantity, 0),
    total: money(subtotalOf(order) + SHIPPING, locale),
    shipments: (order.shipments ?? []).map(({ vendorName, status }) => ({ vendorName, status })),
  };
}

export function toDetail(order: OrderSeed, locale: string): OrderDetail {
  const subtotal = subtotalOf(order);
  const refunded = order.paymentStatus === 'refunded';
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    placedAt: order.placedAt,
    cancelledAt: order.cancelledAt,
    canCancel: canCancel(order),
    lines: buildLines(order, locale),
    totals: {
      subtotal: money(subtotal, locale),
      shipping: money(SHIPPING, locale),
      tax: money(0, locale),
      discount: money(0, locale),
      total: money(subtotal + SHIPPING, locale),
      refunded: refunded ? money(subtotal + SHIPPING, locale) : undefined,
    },
    shippingAddress: {
      name: 'Ayesha Rahman',
      street: 'House 12, Road 5',
      city: 'Dhaka',
      postalCode: '1205',
      country: 'BD',
      phone: '+880 1711 000000',
    },
    shippingMethod: 'Standard delivery',
    tracking: order.shipments ? undefined : order.tracking,
    shipments: (order.shipments ?? []).map((shipment) => ({
      ...shipment,
      lineIndexes: order.lines.flatMap((line, index) =>
        line.vendor === shipment.vendorName ? [index] : []
      ),
    })),
    note: order.note,
  };
}
