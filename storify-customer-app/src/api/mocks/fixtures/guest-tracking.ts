/**
 * The mock store's data for: tracking a guest's order. Every order of the mock
 * history can be found with its number and one of the contacts below; the
 * answer is cut down as the real store cuts it for a guest.
 */
import type { OrderDetail } from '@/contracts/mobile/shop/v1';

import { listOrders, toDetail } from './orders';

/** The email and the phone the mock store holds on every order. */
export const GUEST_EMAIL = 'guest@example.com';
export const GUEST_PHONE = '+880 1711 000000';

/** As the store: 5 lookups per contact per 15 minutes. */
export const TRACK_LIMIT = { max: 5, windowSeconds: 15 * 60 };

const DIGITS = /\D/g;

/** The email in any case, or the phone's digits: how the store compares a contact. */
function normalise(contact: string): string {
  const trimmed = contact.trim();
  return trimmed.includes('@') ? trimmed.toLowerCase() : trimmed.replace(DIGITS, '');
}

/** The number as printed (`ORD-1005`) or as kept (`1005`), in any case. */
function numberOf(value: string): string {
  return value.trim().toUpperCase().replace(/^ORD-/, '');
}

export function contactMatches(contact: string): boolean {
  return (
    normalise(contact) === normalise(GUEST_EMAIL) || normalise(contact) === normalise(GUEST_PHONE)
  );
}

/** The lookups made so far, by contact, with the time of the first of the window. */
let lookups = new Map<string, { count: number; since: number }>();

export function resetGuestTracking(): void {
  lookups = new Map();
}

/** Counts one lookup; the seconds to wait when the contact has used them up, else `null`. */
export function countLookup(contact: string, now: number): number | null {
  const key = normalise(contact);
  const current = lookups.get(key);
  const fresh = !current || now - current.since >= TRACK_LIMIT.windowSeconds * 1000;
  const entry = fresh ? { count: 0, since: now } : current;
  if (entry.count >= TRACK_LIMIT.max) {
    return Math.ceil((entry.since + TRACK_LIMIT.windowSeconds * 1000 - now) / 1000);
  }
  lookups.set(key, { count: entry.count + 1, since: entry.since });
  return null;
}

/** The order with this number, shown as a guest sees it; `undefined` when there is none. */
export function findGuestOrder(orderNumber: string, locale: string): OrderDetail | undefined {
  const wanted = numberOf(orderNumber);
  const order = listOrders().find((candidate) => candidate.number === wanted);
  if (!order) return undefined;

  const detail = toDetail(order, locale);
  return {
    ...detail,
    note: undefined,
    billingAddress: undefined,
    addressHold: undefined,
    canCancel: false,
    shippingAddress: detail.shippingAddress && {
      ...detail.shippingAddress,
      phone: detail.shippingAddress.phone
        ? `*******${detail.shippingAddress.phone.replace(DIGITS, '').slice(-4)}`
        : undefined,
    },
  };
}
