import { describeStatus } from '@/components/ui/badge';
import type {
  OrderDetail,
  OrderLine,
  OrderTracking,
  OrderTrackingEvent,
} from '@/contracts/mobile/shop/v1';

export type TrackingStepKey = 'placed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export type TrackingStep = {
  key: TrackingStepKey;
  reached: boolean;
  /** When it happened, when the store says. The app never guesses a date ahead. */
  at?: string;
  /** The courier's own scans, under "Shipped", newest first. */
  events: OrderTrackingEvent[];
};

/** One parcel and the way it went: the order itself, or one seller's part of it. */
export type Parcel = {
  /** The seller, on an order several sellers ship. */
  vendorName?: string;
  /** Whether the order has several parcels, so each one is named. */
  shared: boolean;
  status: string;
  lines: OrderLine[];
  tracking?: OrderTracking;
  steps: TrackingStep[];
};

const FLOW: TrackingStepKey[] = ['placed', 'processing', 'shipped', 'delivered'];

/** How far along a status is, on the steps of `FLOW`. A status the app does not know counts as placed. */
function reachedIndex(status: string): number {
  const { known } = describeStatus(status);
  if (known === 'processing') return 1;
  if (known === 'shipped') return 2;
  if (known === 'delivered') return 3;
  return 0;
}

function isStopped(status: string): boolean {
  const { known } = describeStatus(status);
  return known === 'cancelled' || known === 'refunded';
}

type Times = { placedAt: string; shippedAt?: string; deliveredAt?: string; cancelledAt?: string };

function stepsFor(status: string, times: Times, tracking: OrderTracking | undefined) {
  const events = tracking?.events ?? [];
  if (isStopped(status)) {
    return [
      { key: 'placed', reached: true, at: times.placedAt, events: [] },
      { key: 'cancelled', reached: true, at: times.cancelledAt, events: [] },
    ] satisfies TrackingStep[];
  }

  const reached = reachedIndex(status);
  const at: Partial<Record<TrackingStepKey, string>> = {
    placed: times.placedAt,
    // The courier's first scan is when the parcel left; its last, once delivered, is the delivery.
    shipped: times.shippedAt ?? events.at(-1)?.at,
    delivered: times.deliveredAt ?? (reached >= 3 ? events[0]?.at : undefined),
  };
  return FLOW.map((key, index) => ({
    key,
    reached: index <= reached,
    at: index <= reached ? at[key] : undefined,
    events: key === 'shipped' ? events : [],
  }));
}

/**
 * The parcels of an order, each with its tracking steps: the order
 * itself when one seller ships it, and one per seller when several do.
 */
export function parcelsOf(order: OrderDetail): Parcel[] {
  if (order.shipments.length === 0) {
    return [
      {
        shared: false,
        status: order.status,
        lines: order.lines,
        tracking: order.tracking,
        steps: stepsFor(order.status, order, order.tracking),
      },
    ];
  }

  return order.shipments.map((shipment) => ({
    vendorName: shipment.vendorName,
    shared: true,
    status: shipment.status,
    lines: order.lines.filter((line) => shipment.lineIndexes.includes(line.index)),
    tracking: shipment.tracking,
    steps: stepsFor(
      shipment.status,
      {
        placedAt: order.placedAt,
        shippedAt: shipment.shippedAt,
        deliveredAt: shipment.deliveredAt,
        cancelledAt: order.cancelledAt,
      },
      shipment.tracking
    ),
  }));
}
