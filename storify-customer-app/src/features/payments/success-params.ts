import type { Href } from 'expo-router';
import * as z from 'zod';

/**
 * How a payment ended, as the outcome screen (`/checkout/success`) is told: in
 * its address. The address can be written by anybody (a link), so the screen
 * reads it through `PaymentResultParams` and shows nothing it does not know.
 */
const FAILED_REASONS = ['soldOut', 'returned', 'notPaid', 'sheet', 'unsupported'] as const;
export type FailedReason = (typeof FAILED_REASONS)[number];

const PaymentResultParams = z.discriminatedUnion('outcome', [
  /** `placed`: cash on delivery. `paid`: the card was charged. */
  z.object({
    outcome: z.enum(['placed', 'paid']),
    /** Without it the order is found in the orders list. The screen encodes it into the order's address. */
    orderId: z.string().min(1).max(100).optional(),
    orderNumber: z.string().min(1).max(40),
  }),
  /** Stripe is still confirming; the screen asks the store until it ends. */
  z.object({ outcome: z.literal('pending'), paymentIntentId: z.string().min(1).max(100) }),
  z.object({
    outcome: z.literal('failed'),
    reason: z.enum(FAILED_REASONS),
    /** Stripe's own sentence, for a sheet that failed. */
    message: z.string().max(200).optional(),
  }),
]);
export type PaymentResult = z.infer<typeof PaymentResultParams>;

/** The outcome screen's address: its path and the result's fields as parameters. */
export function successHref(result: PaymentResult) {
  const params = Object.fromEntries(
    Object.entries(result).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
  return { pathname: '/checkout/success', params } satisfies Href;
}

/**
 * The address's parameters, one value each: a repeated parameter counts as its
 * first. A bare `number` (the checkout screen's own way of saying "order
 * placed") is an order placed under that number.
 */
export function readResult(params: Record<string, string | string[] | undefined>) {
  const single = Object.fromEntries(
    Object.entries(params).map(([name, value]) => [name, Array.isArray(value) ? value[0] : value])
  );
  const told =
    single.outcome === undefined && single.number !== undefined
      ? { outcome: 'placed', orderNumber: single.number }
      : single;
  const parsed = PaymentResultParams.safeParse(told);
  return parsed.success ? parsed.data : null;
}
