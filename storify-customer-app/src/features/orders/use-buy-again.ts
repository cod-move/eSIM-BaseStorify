import { useRouter } from 'expo-router';
import { useState } from 'react';

import { isApiError } from '@/api/errors';
import type { OrderLine } from '@/contracts/mobile/shop/v1';
import { useSetCartLine } from '@/features/cart/use-cart';

/** A line the store would not put in the cart, with the store's refusal. */
export type RefusedLine = { line: OrderLine; error: unknown };

/**
 * Puts each line of a past order in the cart at its quantity, one after the
 * other (each answer is the whole cart). The store prices and refuses: a line
 * it refuses is kept with its refusal and the rest still go in. With no
 * refusal the cart opens at once; otherwise `refused` is listed first and
 * `openCart` goes on. An answer that is not a refusal (no connection) stops
 * the run and is thrown to the caller.
 */
export function useBuyAgain(lines: OrderLine[]) {
  const router = useRouter();
  const setLine = useSetCartLine();
  const [refused, setRefused] = useState<RefusedLine[]>([]);

  const openCart = () => {
    setRefused([]);
    router.push('/cart');
  };

  const run = async () => {
    const refusals: RefusedLine[] = [];
    for (const line of lines) {
      try {
        await setLine.mutateAsync({
          productId: line.productId,
          variantId: line.variantId,
          quantity: line.quantity,
        });
      } catch (error) {
        if (!isApiError(error)) throw error;
        refusals.push({ line, error });
      }
    }
    if (refusals.length === 0) openCart();
    else setRefused(refusals);
  };

  return { run, refused, openCart, isPending: setLine.isPending };
}
