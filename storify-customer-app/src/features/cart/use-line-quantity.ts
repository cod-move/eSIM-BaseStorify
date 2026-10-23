import { useCallback, useEffect, useRef, useState } from 'react';

import type { CartLine } from '@/contracts/mobile/shop/v1';

import { useSetCartLine } from './use-cart';

/**
 * How long the stepper waits after the last tap before it sends the quantity.
 * The store takes 20 cart changes per 15 minutes, so five taps on plus are one
 * request for "make it 6", not five requests.
 */
const QUANTITY_PAUSE_MS = 700;

/**
 * The quantity of one cart line as the stepper shows it.
 *
 * Taps change a count kept here; after a pause the final count is sent, and
 * from the store's answer on the line shows the store's quantity again. While
 * the request is on its way the stepper is disabled. A count still waiting
 * when the screen goes away is sent then, so a quick change is not lost.
 *
 * The count and the line are read when they are sent, not when the tap
 * happened: a refetch that lands during the pause is weighed against the
 * newest count, and that count goes out once.
 */
export function useLineQuantity(line: CartLine) {
  const { mutate, reset, isPending, error } = useSetCartLine();
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(line);
  const waiting = useRef<number | null>(null);

  useEffect(() => {
    latest.current = line;
  }, [line]);

  /** Sends the count waiting, if there is one. It reads refs, so no render's copy is stale. */
  const send = useCallback(() => {
    const quantity = waiting.current;
    waiting.current = null;
    if (quantity === null) return;
    const { productId, variantId, quantity: stored } = latest.current;
    if (quantity === stored) {
      setDraft(null);
      return;
    }
    mutate({ productId, variantId, quantity }, { onSettled: () => setDraft(null) });
  }, [mutate]);

  // `mutate` keeps its identity, so this runs once: when the stepper goes away.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      send();
    },
    [send]
  );

  const change = (quantity: number) => {
    reset();
    setDraft(quantity);
    waiting.current = quantity;
    clearTimeout(timer.current);
    timer.current = setTimeout(send, QUANTITY_PAUSE_MS);
  };

  return {
    quantity: draft ?? line.quantity,
    change,
    busy: isPending,
    error,
  };
}
