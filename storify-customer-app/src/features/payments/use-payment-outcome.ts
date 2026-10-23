import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { confirmCardPayment } from '@/api/endpoints/payments';
import { queryKeys } from '@/api/query-keys';
import { useLocale } from '@/i18n/locale-store';

import { outcomeOf } from './card-payment';
import { pendingPayment } from './pending-payment';
import type { PaymentResult } from './success-params';

// The store answers 100 confirmations in 15 minutes: 3 s, 5 s, 8 s, 13 s, then
// every 15 s (about 4 a minute), and no more than `MAX_ASKS` on their own.
const PAUSES_SECONDS = [3, 5, 8, 13] as const;
const STEADY_SECONDS = 15;
const MAX_ASKS = 40;

/** How long to wait before asking again, after the `asked`-th question. */
export function pauseAfter(asked: number): number {
  return (PAUSES_SECONDS[asked - 1] ?? STEADY_SECONDS) * 1000;
}

/**
 * How a card payment ended, asked of the store until the answer is final. The
 * answer is the same each time it is asked, so asking again is safe. When it
 * is final, the payment is no longer kept on the device and the cart (which
 * the order took) is read again.
 *
 * `result` is `null` while the bank is still processing; `stuck` says the
 * automatic asking has stopped or cannot reach the store, and the shopper can
 * ask once more with `check`.
 */
export function usePaymentOutcome(paymentIntentId: string) {
  const locale = useLocale();
  const queryClient = useQueryClient();
  // Every question put to the store, answered or not: the store's limit counts them all.
  const asks = useRef(0);

  const query = useQuery({
    queryKey: queryKeys.paymentOutcome(locale, paymentIntentId),
    queryFn: async ({ signal }) => {
      asks.current += 1;
      const confirmation = await confirmCardPayment(locale, paymentIntentId, signal);
      return { answer: outcomeOf(confirmation, paymentIntentId), asked: asks.current };
    },
    refetchInterval: (current) => {
      // Only a payment the bank is still processing is asked about again.
      if (current.state.data?.answer.kind !== 'pending' || asks.current >= MAX_ASKS) return false;
      return pauseAfter(asks.current);
    },
  });

  const answer = query.data?.answer;
  const asked = query.data?.asked ?? 0;
  let result: PaymentResult | null = null;
  if (answer?.kind === 'paid') {
    result = { outcome: 'paid', orderId: answer.orderId, orderNumber: answer.orderNumber };
  } else if (answer?.kind === 'failed') {
    result = { outcome: 'failed', reason: answer.reason, message: answer.message };
  }

  const final = result !== null;
  useEffect(() => {
    if (!final) return;
    if (pendingPayment.read() === paymentIntentId) pendingPayment.clear();
    void queryClient.invalidateQueries({ queryKey: queryKeys.cart(locale) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.orderList(locale, {}).slice(0, 4) });
  }, [final, paymentIntentId, locale, queryClient]);

  return {
    result,
    stuck: !final && query.data !== undefined && (query.isRefetchError || asked >= MAX_ASKS),
    // A first answer that never came; once the store has answered, a failed ask is `stuck`.
    error: query.data ? null : query.error,
    check: () => void query.refetch(),
  };
}
