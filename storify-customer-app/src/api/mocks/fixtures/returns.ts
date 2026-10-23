/**
 * The mock store's data for: returns. Every mock shopper has the same order
 * history, so they share the returns made from it too.
 *
 * What can be returned, as the mock store decides it: the lines of a
 * delivered order (or of a seller's delivered parcel), less what is already
 * being returned. Order 1003 (cash on delivery) can be returned, with one of
 * its three tees already refunded, and asks where the refund goes; order 1004's
 * seller takes returns only through the store's team. The window never
 * closes, so the mock answers the same whatever the day.
 */
import type {
  CreateReturnRequest,
  OrderDetail,
  ReturnOptions,
  ReturnPreview,
  ReturnPreviewRequest,
  ReturnRefund,
  ReturnTimes,
  RefundDestinationBody,
  ShopperReturn,
} from '@/contracts/mobile/shop/v1';

import { findOrder, toDetail } from './orders';
import { money } from './shared';

export type ReturnableOrder = NonNullable<ReturnType<typeof findOrder>>;

const REASONS = [
  { code: 'damaged_or_defective', label: 'Damaged or defective', storeAtFault: true },
  { code: 'wrong_item', label: 'Wrong item sent', storeAtFault: true },
  { code: 'not_as_described', label: 'Not as described', storeAtFault: true },
  { code: 'changed_mind', label: 'Changed my mind', storeAtFault: false },
  { code: 'other', label: 'Something else', storeAtFault: false },
] as const;

/** The reason that needs a note. */
export const NOTE_REASON = 'other';

const STATUS_LABELS: Record<string, string> = {
  requested: 'Requested',
  approved: 'Approved',
  rejected: 'Rejected',
  received: 'Received',
  refund_pending: 'Refund pending',
  refunded: 'Refunded',
  closed: 'Closed',
};

const REFUND_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  processing: 'Processing',
  succeeded: 'Paid back',
  manual_required: 'Paid by the store',
};

/** Payment methods that leave no card to refund. */
const PAID_BY_HAND = new Set(['cod', 'bank_transfer']);
/** Orders whose seller takes returns only through the store's team. */
const THROUGH_STORE = new Set(['ord_1004']);
const THROUGH_STORE_MESSAGE = 'This seller takes returns through our team. Please contact us.';

const WINDOW_ENDS_AT = '2026-12-31T23:59:59Z';
const RESTOCKING_FEE = 2;
const RETURN_SHIPPING_FEE = 3;

type StoredReturn = {
  id: string;
  number: string;
  orderId: string;
  reason: string;
  note?: string;
  lines: { index: number; quantity: number }[];
  status: string;
  refundStatus: string;
  times: ReturnTimes;
  refundDestination?: RefundDestinationBody;
};

const SEED_RETURNS: StoredReturn[] = [
  {
    id: 'ret_2001',
    number: 'R-2001',
    orderId: 'ord_1003',
    reason: 'damaged_or_defective',
    lines: [{ index: 0, quantity: 1 }],
    status: 'refunded',
    refundStatus: 'succeeded',
    times: {
      requestedAt: '2026-09-08T10:00:00Z',
      approvedAt: '2026-09-09T09:30:00Z',
      receivedAt: '2026-09-12T15:00:00Z',
      refundedAt: '2026-09-13T11:00:00Z',
    },
    refundDestination: {
      method: 'mobile_money',
      provider: 'bKash',
      accountName: 'Ayesha Rahman',
      accountNumber: '01711000000',
    },
  },
];

let returns = SEED_RETURNS.map((stored) => ({ ...stored }));
let sequence = 2001;

export function resetReturns(): void {
  returns = SEED_RETURNS.map((stored) => ({ ...stored }));
  sequence = 2001;
}

/** Newest first. */
export function listReturns(): StoredReturn[] {
  return [...returns].reverse();
}

export function findReturn(id: string): StoredReturn | undefined {
  return returns.find((stored) => stored.id === id);
}

function delivered(order: ReturnableOrder, index: number): boolean {
  if (order.status === 'delivered') return true;
  const vendor = order.lines[index]?.vendor;
  return (order.shipments ?? []).some(
    (shipment) => shipment.vendorName === vendor && shipment.status === 'delivered'
  );
}

function alreadyReturned(orderId: string, index: number): number {
  return returns
    .filter((stored) => stored.orderId === orderId && stored.status !== 'rejected')
    .flatMap((stored) => stored.lines)
    .filter((line) => line.index === index)
    .reduce((sum, line) => sum + line.quantity, 0);
}

/** How many of a line can still be returned, and why none can when none can. */
export function lineReturnability(order: ReturnableOrder, index: number) {
  const line = order.lines[index];
  if (!line || !delivered(order, index)) {
    return { returnable: 0, blocked: 'NOT_RETURNABLE' } as const;
  }
  const returnable = Math.max(line.quantity - alreadyReturned(order.id, index), 0);
  return { returnable, blocked: undefined };
}

export function throughStore(order: ReturnableOrder): boolean {
  return THROUGH_STORE.has(order.id);
}

/** The order as the store sends it, with what may be returned of it. */
export function withReturns(order: ReturnableOrder, detail: OrderDetail): OrderDetail {
  const lines = detail.lines.map((line) => {
    const { returnable, blocked } = lineReturnability(order, line.index);
    return {
      ...line,
      returnableQuantity: throughStore(order) ? 0 : returnable,
      returnBlockedReason: returnable === 0 && blocked ? blocked : undefined,
      returnWindowEndsAt: delivered(order, line.index) ? WINDOW_ENDS_AT : undefined,
    };
  });
  const anyDelivered = order.lines.some((_, index) => delivered(order, index));
  const canReturn = lines.some((line) => (line.returnableQuantity ?? 0) > 0);
  const refused = anyDelivered && !canReturn;
  return {
    ...detail,
    lines,
    canReturn,
    returnWindowEndsAt: anyDelivered ? WINDOW_ENDS_AT : undefined,
    returnBlockedReason: refused
      ? throughStore(order)
        ? 'RETURNS_THROUGH_STORE'
        : 'NOT_RETURNABLE'
      : undefined,
    returnBlockedMessage: refused
      ? throughStore(order)
        ? THROUGH_STORE_MESSAGE
        : 'Everything on this order is already being returned.'
      : undefined,
  };
}

export function needsDestination(order: ReturnableOrder): boolean {
  return PAID_BY_HAND.has(order.paymentMethod);
}

export function optionsFor(order: ReturnableOrder): ReturnOptions {
  const required = needsDestination(order);
  return {
    reasons: REASONS.map(({ code, label }) => ({
      code,
      label,
      noteRequired: code === NOTE_REASON,
    })),
    refundDestination: {
      required,
      message: required ? 'You paid in cash, so tell us where to send your refund.' : undefined,
      methods: required
        ? [
            {
              method: 'mobile_money',
              label: 'Mobile wallet',
              fields: [
                { key: 'provider', label: 'Wallet', placeholder: 'bKash', required: true },
                { key: 'accountNumber', label: 'Wallet number', required: true },
                { key: 'accountName', label: 'Name on the wallet', required: false },
              ],
            },
            {
              method: 'bank_transfer',
              label: 'Bank transfer',
              fields: [
                { key: 'accountName', label: 'Account holder', required: true },
                { key: 'accountNumber', label: 'Account number', required: true },
                { key: 'provider', label: 'Bank', required: true },
              ],
            },
            {
              method: 'cash',
              label: 'Cash',
              fields: [],
              note: 'The store will arrange a time to hand it over.',
            },
          ]
        : [],
    },
  };
}

export function isReason(code: string): boolean {
  return REASONS.some((reason) => reason.code === code);
}

function storeAtFault(reason: string): boolean {
  return REASONS.some((candidate) => candidate.code === reason && candidate.storeAtFault);
}

/** The lines grouped by the seller who shipped them: one parcel each. */
function parcelsOf(order: ReturnableOrder, lines: ReturnPreviewRequest['lines']) {
  const groups = new Map<string, ReturnPreviewRequest['lines']>();
  for (const line of lines) {
    const vendor = order.lines[line.index]?.vendor ?? '';
    groups.set(vendor, [...(groups.get(vendor) ?? []), line]);
  }
  return [...groups.values()];
}

function refundOf(
  detail: OrderDetail,
  lines: ReturnPreviewRequest['lines'],
  reason: string,
  locale: string
): { refund: ReturnRefund; total: number } {
  const items = lines.reduce(
    (sum, line) => sum + (detail.lines[line.index]?.unitPrice.amount ?? 0) * line.quantity,
    0
  );
  const fault = storeAtFault(reason);
  const shipping = fault ? detail.totals.shipping.amount : 0;
  const restocking = fault ? 0 : RESTOCKING_FEE;
  const returnShipping = fault ? 0 : RETURN_SHIPPING_FEE;
  const total = Math.max(items + shipping - restocking - returnShipping, 0);
  return {
    total,
    refund: {
      items: money(items, locale),
      discount: money(0, locale),
      tax: money(0, locale),
      shipping: money(shipping, locale),
      restockingFee: money(restocking, locale),
      returnShippingFee: money(returnShipping, locale),
      total: money(total, locale),
    },
  };
}

export function previewFor(
  order: ReturnableOrder,
  body: ReturnPreviewRequest,
  locale: string
): ReturnPreview {
  const detail = toDetail(order, locale);
  let sum = 0;
  const parcels = parcelsOf(order, body.lines).map((lines) => {
    const { refund, total } = refundOf(detail, lines, body.reason, locale);
    sum += total;
    return {
      lines: lines.map((line) => ({
        index: line.index,
        name: detail.lines[line.index]?.name ?? '',
        quantity: line.quantity,
      })),
      refund,
    };
  });
  return {
    parcels,
    total: money(sum, locale),
    storeAtFault: storeAtFault(body.reason),
    // This mock store hands the delivery back only when the fault is its own.
    refundsShipping: storeAtFault(body.reason),
    refundDestinationRequired: needsDestination(order),
  };
}

/** Makes one return per seller, and answers them. */
export function createReturns(
  order: ReturnableOrder,
  body: CreateReturnRequest,
  locale: string
): ShopperReturn[] {
  const requestedAt = new Date().toISOString();
  const made = parcelsOf(order, body.lines).map((lines) => {
    sequence += 1;
    const stored: StoredReturn = {
      id: `ret_${sequence}`,
      number: `R-${sequence}`,
      orderId: order.id,
      reason: body.reason,
      note: body.note,
      lines,
      status: 'requested',
      refundStatus: 'pending',
      times: { requestedAt },
      refundDestination: body.refundDestination,
    };
    returns.push(stored);
    return stored;
  });
  return made.map((stored) => toShopperReturn(stored, locale));
}

function masked(number: string | undefined): string | undefined {
  return number === undefined ? undefined : `****${number.slice(-4)}`;
}

export function toShopperReturn(stored: StoredReturn, locale: string): ShopperReturn {
  // A return is only ever made from an order of the history, which stays.
  const order = findOrder(stored.orderId);
  if (!order) throw new Error(`Mock store: return ${stored.id} has no order`);
  const detail = toDetail(order, locale);
  const { refund } = refundOf(detail, stored.lines, stored.reason, locale);
  const destination = stored.refundDestination;
  const method = optionsFor(order).refundDestination.methods.find(
    (candidate) => candidate.method === destination?.method
  );
  return {
    id: stored.id,
    number: stored.number,
    orderId: stored.orderId,
    orderNumber: detail.number,
    status: stored.status,
    statusLabel: STATUS_LABELS[stored.status] ?? stored.status,
    refundStatus: stored.refundStatus,
    refundStatusLabel: REFUND_STATUS_LABELS[stored.refundStatus] ?? stored.refundStatus,
    reason: stored.reason,
    reasonLabel: REASONS.find((reason) => reason.code === stored.reason)?.label ?? stored.reason,
    note: stored.note,
    lines: stored.lines.map((line) => {
      const ordered = detail.lines[line.index];
      return {
        index: line.index,
        slug: ordered?.slug,
        name: ordered?.name ?? '',
        image: ordered?.image,
        quantityRequested: line.quantity,
        quantityApproved: stored.status === 'requested' ? undefined : line.quantity,
        unitPrice: ordered?.unitPrice ?? money(0, locale),
      };
    }),
    refund,
    refunded: stored.refundStatus === 'succeeded' ? refund.total : undefined,
    refundDestination: destination
      ? {
          method: destination.method,
          label: method?.label ?? destination.method,
          provider: destination.provider,
          accountName: destination.accountName,
          accountNumber: masked(destination.accountNumber),
        }
      : undefined,
    instructions:
      stored.status === 'requested'
        ? 'Pack the items in their box. We will email a return label once the request is approved.'
        : undefined,
    times: stored.times,
  };
}
