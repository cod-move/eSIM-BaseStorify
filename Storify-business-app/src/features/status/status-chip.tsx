import { useTranslations } from 'use-intl';

import { StatusChip as ToneChip } from '@/components/ui/status-chip';

import { knownStatus, statusTone, storeWord, type StatusKind } from './status-tone';

/**
 * The word for a status, in the operator's language: the app's translation
 * when it knows the status, else the store's own word.
 */
export function useStatusLabel(): (kind: StatusKind, status: string) => string {
  const t = useTranslations('status');

  return (kind, status) => {
    const known = knownStatus(kind, status);
    // The key is built from the table in status-tone.ts, which en.json mirrors (a test holds them).
    return known ? t(`${kind}.${known}` as never) : storeWord(status);
  };
}

type StatusProps = {
  /** The status exactly as the store sent it. */
  status: string;
  className?: string;
};

function chipOf(kind: StatusKind) {
  function KindChip({ status, className }: StatusProps) {
    const label = useStatusLabel();
    return (
      <ToneChip tone={statusTone(kind, status)} label={label(kind, status)} className={className} />
    );
  }
  return KindChip;
}

/**
 * The status chips every screen uses, so that a status reads the same
 * everywhere. Each takes the store's status as sent.
 */
export const OrderStatusChip = chipOf('order');
export const PaymentStatusChip = chipOf('payment');
export const ProductStatusChip = chipOf('product');
export const PayoutStatusChip = chipOf('payout');
export const ApplicationStatusChip = chipOf('application');
export const ConversationStatusChip = chipOf('conversation');
/** A product's stock: `in_stock`, `low` or `out`, as the screen works it out from what the store sent. */
export const StockStatusChip = chipOf('stock');
