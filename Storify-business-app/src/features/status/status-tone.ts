import type { StatusTone } from '@/components/ui/status-chip';

/**
 * Which tone each status of the store gets, by kind.
 * The statuses are the store's own words, passed through by the API: a status
 * this table does not know is shown as the store wrote it, in `neutral`.
 *
 * Red (`danger`) is kept for what went wrong and may need the operator; a
 * cancelled order is finished and asks nothing, so it is `neutral`.
 */
export const STATUS_TONES = {
  order: {
    pending: 'warning',
    preordered: 'info',
    processing: 'info',
    shipped: 'info',
    delivered: 'success',
    cancelled: 'neutral',
    returned: 'neutral',
    refunded: 'neutral',
  },
  payment: {
    pending: 'warning',
    partially_paid: 'warning',
    paid: 'success',
    refunded: 'neutral',
    partially_refunded: 'neutral',
    expired: 'danger',
    failed: 'danger',
  },
  product: {
    active: 'success',
    draft: 'neutral',
    unlisted: 'neutral',
  },
  payout: {
    pending: 'warning',
    processing: 'info',
    paid: 'success',
    failed: 'danger',
    cancelled: 'neutral',
  },
  // The shop applied for, in the store's words: `submitted` waits for a
  // decision; the last three are an applicant who never finished applying.
  application: {
    submitted: 'warning',
    approved: 'success',
    rejected: 'danger',
    suspended: 'danger',
    draft: 'neutral',
    payment_pending: 'neutral',
    paid_pending_submit: 'neutral',
  },
  conversation: {
    open: 'info',
    pending: 'warning',
    resolved: 'neutral',
    closed: 'neutral',
    spam: 'neutral',
  },
  stock: {
    in_stock: 'success',
    low: 'warning',
    out: 'danger',
  },
} as const satisfies Record<string, Record<string, StatusTone>>;

export type StatusKind = keyof typeof STATUS_TONES;

/** A status the table knows for its kind, or `null`. Case and the store's spelling of "canceled" do not matter. */
export function knownStatus(kind: StatusKind, status: string): string | null {
  const spelled = status
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/^canceled$/, 'cancelled');
  return spelled in STATUS_TONES[kind] ? spelled : null;
}

/** The tone of a status: its kind's, or `neutral` for one the app does not know. */
export function statusTone(kind: StatusKind, status: string): StatusTone {
  const known = knownStatus(kind, status);
  const tones: Record<string, StatusTone> = STATUS_TONES[kind];
  return known ? (tones[known] ?? 'neutral') : 'neutral';
}

/** A status the app has no word for, as the store wrote it, readable: `on_hold` → "On hold". */
export function storeWord(status: string): string {
  const words = status.trim().replace(/[_-]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
