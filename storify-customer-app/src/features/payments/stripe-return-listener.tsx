import { addEventListener } from 'expo-linking';
import { useEffect } from 'react';

import { isStripeReturn } from './stripe-return';
import { handleStripeReturn } from './stripe-sheet';

/**
 * Passes Stripe the address a bank sends the shopper back on, while the card
 * sheet waits for it. Mounted once, at the root; it draws nothing.
 */
export function StripeReturnListener(): null {
  useEffect(() => {
    const subscription = addEventListener('url', ({ url }) => {
      if (isStripeReturn(url)) void handleStripeReturn(url);
    });
    return () => subscription.remove();
  }, []);

  return null;
}
