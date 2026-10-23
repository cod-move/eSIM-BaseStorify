/**
 * The mock store's orders. An order is split into consignments, one per seller
 * (the store's own goods have no seller); each line belongs to one. The order's
 * status is worked out from its consignments' (see `routes/orders.ts`).
 *
 * What they show between them:
 * - #1042: new, split between Green Leaf and Urban Thread, cash on delivery.
 * - #1041: paid by card, split between the store and Green Leaf: cancel needs a refund.
 * - #1040, #1029: new, one seller each.
 * - #1039: a pre-order with its deposit paid.
 * - #1038: shipping on hold until the customer checks the address.
 * - #1037, #1030: shipped, with tracking.
 * - #1036, #1031: delivered.
 * - #1035: cancelled and refunded.
 * - #1034: a walk-in sale at the counter: no customer.
 * - #1033: collected in person from the seller.
 * - #1009–#1028: older sales of the store's own goods, delivered and paid, so
 *   the store's lists run past one page.
 */
import type { OrderAddress } from '@/contracts/mobile/biz/v1';

import { daysAgo, hoursAgo, minutesAgo } from './shared';

export type MockLine = {
  productId: string;
  variantId?: string;
  name: string;
  variantName?: string;
  picture: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  preOrder: boolean;
};

export type MockConsignment = {
  id: string;
  /** Left out for the store's own goods. */
  vendorId?: string;
  status: string;
  /** Positions in the order's `lines`. */
  lineIndexes: number[];
  pickup: boolean;
  tracking?: { carrier?: string; number?: string; url?: string };
  shippedAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
};

export type MockTimelineEvent = { at: string; kind: string; message: string; by?: string };

export type MockOrder = {
  id: string;
  number: string;
  paymentStatus: string;
  paymentMethod: string;
  placedAt: string;
  channel: string;
  /** `null` for a walk-in sale at the counter. */
  customer: { name?: string; email?: string; phone?: string } | null;
  lines: MockLine[];
  consignments: MockConsignment[];
  shipping: number;
  tax: number;
  discount: number;
  refunded?: number;
  shippingAddress?: OrderAddress;
  billingAddress?: OrderAddress;
  shippingMethod?: string;
  customerNote?: string;
  addressHold?: { message?: string; deadlineAt?: string };
  cancelledAt?: string;
  cancelReason?: string;
  timeline: MockTimelineEvent[];
  updatedAt: string;
};

const address = (name: string, street: string, city: string, phone: string): OrderAddress => ({
  name,
  street,
  city,
  postalCode: '1207',
  country: 'BD',
  phone,
});

const line = (
  productId: string,
  name: string,
  quantity: number,
  unitPrice: number,
  extra: Partial<MockLine> = {}
): MockLine => ({
  productId,
  name,
  picture: productId.replace('prod_', ''),
  quantity,
  unitPrice,
  preOrder: false,
  ...extra,
});

const placed = (at: string): MockTimelineEvent => ({ at, kind: 'placed', message: 'Order placed' });

/** A fresh copy of the orders, newest first. */
export function seedOrders(): MockOrder[] {
  const orders: MockOrder[] = [];
  const add = (order: Omit<MockOrder, 'timeline' | 'updatedAt'> & Partial<MockOrder>) =>
    orders.push({ timeline: [placed(order.placedAt)], updatedAt: order.placedAt, ...order });

  add({
    id: 'ord_1042',
    number: '1042',
    paymentStatus: 'pending',
    paymentMethod: 'cod',
    placedAt: minutesAgo(12),
    channel: 'online',
    customer: { name: 'Karim Uddin', email: 'karim@example.com', phone: '+8801711000001' },
    lines: [
      line('prod_towel', 'Linen tea towel (set of 2)', 1, 18, { sku: 'TOWEL-LIN-2' }),
      line('prod_tee', 'Organic cotton tee', 2, 25, {
        variantId: 'var_tee_m',
        variantName: 'M',
        sku: 'TEE-ORG-M',
      }),
    ],
    consignments: [
      {
        id: 'con_1042_a',
        vendorId: 'vendor_green',
        status: 'pending',
        lineIndexes: [0],
        pickup: false,
      },
      {
        id: 'con_1042_b',
        vendorId: 'vendor_urban',
        status: 'pending',
        lineIndexes: [1],
        pickup: false,
      },
    ],
    shipping: 6,
    tax: 0,
    discount: 0,
    shippingAddress: address('Karim Uddin', 'House 12, Road 5', 'Dhaka', '+8801711000001'),
    billingAddress: address('Karim Uddin', 'House 12, Road 5', 'Dhaka', '+8801711000001'),
    shippingMethod: 'Standard delivery',
    customerNote: 'Please call before delivery.',
  });

  add({
    id: 'ord_1041',
    number: '1041',
    paymentStatus: 'paid',
    paymentMethod: 'stripe',
    placedAt: hoursAgo(2),
    channel: 'online',
    customer: { name: 'Rina Begum', email: 'rina@example.com', phone: '+8801711000002' },
    lines: [
      line('prod_vase', 'Ceramic bud vase', 1, 24, { sku: 'VASE-01' }),
      line('prod_candle', 'Beeswax pillar candle', 2, 12.5, { sku: 'CANDLE-PILLAR' }),
    ],
    consignments: [
      { id: 'con_1041_a', status: 'processing', lineIndexes: [0], pickup: false },
      {
        id: 'con_1041_b',
        vendorId: 'vendor_green',
        status: 'processing',
        lineIndexes: [1],
        pickup: false,
      },
    ],
    shipping: 5,
    tax: 2.45,
    discount: 3,
    shippingAddress: address('Rina Begum', 'Flat 4B, 23 Lake Road', 'Dhaka', '+8801711000002'),
    billingAddress: address('Rina Begum', 'Flat 4B, 23 Lake Road', 'Dhaka', '+8801711000002'),
    shippingMethod: 'Express delivery',
    timeline: [
      {
        at: hoursAgo(1),
        kind: 'status_change',
        message: 'Status changed from pending to processing',
        by: 'Amina Rahman',
      },
      { at: hoursAgo(2), kind: 'payment', message: 'Payment of $59.45 received by card' },
      placed(hoursAgo(2)),
    ],
    updatedAt: hoursAgo(1),
  });

  add({
    id: 'ord_1040',
    number: '1040',
    paymentStatus: 'pending',
    paymentMethod: 'cod',
    placedAt: hoursAgo(5),
    channel: 'online',
    customer: { name: 'Omar Faruk', email: 'omar@example.com', phone: '+8801711000003' },
    lines: [
      line('prod_mug', 'Stoneware mug', 2, 16, {
        variantId: 'var_mug_sage',
        variantName: 'Sage',
        sku: 'MUG-SAGE',
      }),
    ],
    consignments: [
      {
        id: 'con_1040_a',
        vendorId: 'vendor_green',
        status: 'pending',
        lineIndexes: [0],
        pickup: false,
      },
    ],
    shipping: 4,
    tax: 0,
    discount: 0,
    shippingAddress: address('Omar Faruk', '7 Station Road', 'Chattogram', '+8801711000003'),
    shippingMethod: 'Standard delivery',
  });

  add({
    id: 'ord_1039',
    number: '1039',
    paymentStatus: 'partially_paid',
    paymentMethod: 'stripe',
    placedAt: daysAgo(1),
    channel: 'online',
    customer: { name: 'Shirin Akter', email: 'shirin@example.com' },
    lines: [
      line('prod_mug', 'Stoneware mug', 1, 16, {
        variantId: 'var_mug_sand',
        variantName: 'Sand',
        sku: 'MUG-SAND',
        preOrder: true,
      }),
    ],
    consignments: [
      {
        id: 'con_1039_a',
        vendorId: 'vendor_green',
        status: 'preordered',
        lineIndexes: [0],
        pickup: false,
      },
    ],
    shipping: 4,
    tax: 0,
    discount: 0,
    shippingAddress: address('Shirin Akter', '19 Green Avenue', 'Sylhet', '+8801711000004'),
    shippingMethod: 'Standard delivery',
  });

  add({
    id: 'ord_1038',
    number: '1038',
    paymentStatus: 'pending',
    paymentMethod: 'cod',
    placedAt: daysAgo(1),
    channel: 'online',
    customer: { name: 'Tania Sultana', email: 'tania@example.com', phone: '+8801711000005' },
    lines: [line('prod_candle', 'Beeswax pillar candle', 3, 12.5, { sku: 'CANDLE-PILLAR' })],
    consignments: [
      {
        id: 'con_1038_a',
        vendorId: 'vendor_green',
        status: 'processing',
        lineIndexes: [0],
        pickup: false,
      },
    ],
    shipping: 4,
    tax: 0,
    discount: 0,
    shippingAddress: address('Tania Sultana', 'Road 2, Block C', 'Rajshahi', '+8801711000005'),
    shippingMethod: 'Standard delivery',
    addressHold: {
      message: 'The courier could not match this address. The customer was asked to check it.',
      deadlineAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });

  add({
    id: 'ord_1037',
    number: '1037',
    paymentStatus: 'paid',
    paymentMethod: 'stripe',
    placedAt: daysAgo(2),
    channel: 'online',
    customer: { name: 'Tanvir Hossain', email: 'tanvir@example.com' },
    lines: [
      line('prod_tee', 'Organic cotton tee', 1, 25, {
        variantId: 'var_tee_s',
        variantName: 'S',
        sku: 'TEE-ORG-S',
      }),
    ],
    consignments: [
      {
        id: 'con_1037_a',
        vendorId: 'vendor_urban',
        status: 'shipped',
        lineIndexes: [0],
        pickup: false,
        tracking: {
          carrier: 'Pathao',
          number: 'PTH-88412',
          url: 'https://example.com/track/PTH-88412',
        },
        shippedAt: daysAgo(1),
      },
    ],
    shipping: 5,
    tax: 0,
    discount: 0,
    shippingAddress: address('Tanvir Hossain', '44 New Market Road', 'Khulna', '+8801711000006'),
    shippingMethod: 'Standard delivery',
  });

  add({
    id: 'ord_1036',
    number: '1036',
    paymentStatus: 'paid',
    paymentMethod: 'cod',
    placedAt: daysAgo(3),
    channel: 'online',
    customer: { name: 'Jamal Uddin', email: 'jamal@example.com' },
    lines: [line('prod_vase', 'Ceramic bud vase', 2, 24, { sku: 'VASE-01' })],
    consignments: [
      {
        id: 'con_1036_a',
        status: 'delivered',
        lineIndexes: [0],
        pickup: false,
        tracking: { carrier: 'Steadfast', number: 'SF-10293' },
        shippedAt: daysAgo(2),
        deliveredAt: daysAgo(1),
      },
    ],
    shipping: 5,
    tax: 0,
    discount: 0,
    shippingAddress: address('Jamal Uddin', '3 Mosque Lane', 'Dhaka', '+8801711000007'),
    shippingMethod: 'Standard delivery',
  });

  add({
    id: 'ord_1035',
    number: '1035',
    paymentStatus: 'refunded',
    paymentMethod: 'stripe',
    placedAt: daysAgo(4),
    channel: 'online',
    customer: { name: 'Mehedi Hasan', email: 'mehedi@example.com' },
    lines: [
      line('prod_mug', 'Stoneware mug', 1, 18, {
        variantId: 'var_mug_charcoal',
        variantName: 'Charcoal',
        sku: 'MUG-CHAR',
      }),
    ],
    consignments: [
      {
        id: 'con_1035_a',
        vendorId: 'vendor_green',
        status: 'cancelled',
        lineIndexes: [0],
        pickup: false,
        cancelledAt: daysAgo(3),
      },
    ],
    shipping: 4,
    tax: 0,
    discount: 0,
    refunded: 22,
    cancelledAt: daysAgo(3),
    cancelReason: 'Customer asked to cancel',
    shippingAddress: address('Mehedi Hasan', '8 College Road', 'Dhaka', '+8801711000008'),
    shippingMethod: 'Standard delivery',
  });

  add({
    id: 'ord_1034',
    number: '1034',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    placedAt: daysAgo(4),
    channel: 'pos',
    customer: null,
    lines: [line('prod_tote', 'Canvas tote bag', 2, 14, { sku: 'TOTE-CNV-01' })],
    consignments: [
      {
        id: 'con_1034_a',
        status: 'delivered',
        lineIndexes: [0],
        pickup: true,
        deliveredAt: daysAgo(4),
      },
    ],
    shipping: 0,
    tax: 0,
    discount: 0,
  });

  add({
    id: 'ord_1033',
    number: '1033',
    paymentStatus: 'pending',
    paymentMethod: 'cod',
    placedAt: daysAgo(5),
    channel: 'online',
    customer: { name: 'Mitu Rani', email: 'mitu@example.com', phone: '+8801711000009' },
    lines: [line('prod_candle', 'Beeswax pillar candle', 1, 12.5, { sku: 'CANDLE-PILLAR' })],
    consignments: [
      {
        id: 'con_1033_a',
        vendorId: 'vendor_green',
        status: 'processing',
        lineIndexes: [0],
        pickup: true,
      },
    ],
    shipping: 0,
    tax: 0,
    discount: 0,
    shippingMethod: 'Collect from Green Leaf studio',
  });

  add({
    id: 'ord_1031',
    number: '1031',
    paymentStatus: 'paid',
    paymentMethod: 'paypal',
    placedAt: daysAgo(6),
    channel: 'online',
    customer: { name: 'Nusrat Jahan', email: 'nusrat@example.com' },
    lines: [line('prod_towel', 'Linen tea towel (set of 2)', 2, 18, { sku: 'TOWEL-LIN-2' })],
    consignments: [
      {
        id: 'con_1031_a',
        vendorId: 'vendor_green',
        status: 'delivered',
        lineIndexes: [0],
        pickup: false,
        tracking: { carrier: 'RedX', number: 'RX-55120' },
        shippedAt: daysAgo(5),
        deliveredAt: daysAgo(2),
      },
    ],
    shipping: 4,
    tax: 0,
    discount: 0,
    shippingAddress: address('Nusrat Jahan', '15 Park Street', 'Dhaka', '+8801711000010'),
    shippingMethod: 'Standard delivery',
  });

  add({
    id: 'ord_1030',
    number: '1030',
    paymentStatus: 'pending',
    paymentMethod: 'cod',
    placedAt: daysAgo(7),
    channel: 'online',
    customer: { name: 'Abdul Karim', email: 'abdul@example.com', phone: '+8801711000011' },
    lines: [
      line('prod_vase', 'Ceramic bud vase', 1, 24, { sku: 'VASE-01' }),
      line('prod_candle', 'Beeswax pillar candle', 1, 12.5, { sku: 'CANDLE-PILLAR' }),
    ],
    consignments: [
      {
        id: 'con_1030_a',
        status: 'shipped',
        lineIndexes: [0],
        pickup: false,
        tracking: { carrier: 'Steadfast', number: 'SF-10112' },
        shippedAt: daysAgo(6),
      },
      {
        id: 'con_1030_b',
        vendorId: 'vendor_green',
        status: 'shipped',
        lineIndexes: [1],
        pickup: false,
        tracking: { carrier: 'Pathao', number: 'PTH-80071' },
        shippedAt: daysAgo(6),
      },
    ],
    shipping: 6,
    tax: 0,
    discount: 0,
    shippingAddress: address('Abdul Karim', '27 River View', 'Barishal', '+8801711000011'),
    shippingMethod: 'Standard delivery',
  });

  add({
    id: 'ord_1029',
    number: '1029',
    paymentStatus: 'pending',
    paymentMethod: 'cod',
    placedAt: daysAgo(8),
    channel: 'online',
    customer: { name: 'Sabbir Rahman', email: 'sabbir@example.com' },
    lines: [
      line('prod_tee', 'Organic cotton tee', 1, 25, {
        variantId: 'var_tee_m',
        variantName: 'M',
        sku: 'TEE-ORG-M',
      }),
    ],
    consignments: [
      {
        id: 'con_1029_a',
        vendorId: 'vendor_urban',
        status: 'pending',
        lineIndexes: [0],
        pickup: false,
      },
    ],
    shipping: 4,
    tax: 0,
    discount: 0,
    shippingAddress: address('Sabbir Rahman', '9 Hill Road', 'Cumilla', '+8801711000012'),
    shippingMethod: 'Standard delivery',
  });

  const regulars = ['Farhana Islam', 'Rashed Khan', 'Laila Ahmed', 'Imran Hossain', 'Sadia Noor'];
  for (let number = 1028; number >= 1009; number -= 1) {
    const age = 9 + (1028 - number);
    // Every fourth one was sold at the counter, to nobody in particular.
    const counter = number % 4 === 0;
    const name = regulars[number % regulars.length] as string;
    add({
      id: `ord_${number}`,
      number: String(number),
      paymentStatus: 'paid',
      paymentMethod: counter ? 'cash' : 'cod',
      placedAt: daysAgo(age),
      channel: counter ? 'pos' : 'online',
      customer: counter
        ? null
        : { name, email: `${name.split(' ')[0]?.toLowerCase()}@example.com` },
      lines: [line('prod_vase', 'Ceramic bud vase', 1 + (number % 3), 24, { sku: 'VASE-01' })],
      consignments: [
        {
          id: `con_${number}_a`,
          status: 'delivered',
          lineIndexes: [0],
          pickup: counter,
          ...(counter ? {} : { shippedAt: daysAgo(age - 1) }),
          deliveredAt: daysAgo(counter ? age : age - 3),
        },
      ],
      shipping: counter ? 0 : 5,
      tax: 0,
      discount: 0,
      ...(counter
        ? {}
        : {
            shippingAddress: address(
              name,
              `${number - 1000} Lake Circus`,
              'Dhaka',
              '+8801711000099'
            ),
            shippingMethod: 'Standard delivery',
          }),
    });
  }

  return orders.sort((a, b) => b.placedAt.localeCompare(a.placedAt));
}
