import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { REDIRECT_PAYMENT_METHODS, type RedirectPaymentMethod } from '@/contracts/mobile/shop/v1';
import { successHref } from '@/features/payments/success-params';
import { secureStorage } from '@/lib/secure-storage';

/** The eSIM module's own key of `secureStorage` (the app's keys are in lib/storage-keys.ts). */
const KEY = 'storify.esim.redirect-pending';

/**
 * A payment on a gateway's page that was still being confirmed when the
 * shopper left it (APP-09). Kept on the device, as the card's is, so the
 * store is asked again how it ended the next time checkout opens — the money
 * may have arrived meanwhile.
 */
export const redirectPending = {
  read(): { method: RedirectPaymentMethod; reference: string } | null {
    const raw = secureStorage.getItem(KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { method?: unknown; reference?: unknown };
      if (
        typeof parsed.reference === 'string' &&
        (REDIRECT_PAYMENT_METHODS as readonly unknown[]).includes(parsed.method)
      ) {
        return { method: parsed.method as RedirectPaymentMethod, reference: parsed.reference };
      }
    } catch {
      // Unreadable: forgotten below.
    }
    secureStorage.removeItem(KEY);
    return null;
  },
  write(pending: { method: RedirectPaymentMethod; reference: string }): void {
    secureStorage.setItem(KEY, JSON.stringify(pending));
  },
  clear(): void {
    secureStorage.removeItem(KEY);
  },
};

/** At checkout, a payment left being confirmed is asked about first (patch P24, beside the card's). */
export function useResumeRedirectPayment() {
  const router = useRouter();
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    const pending = redirectPending.read();
    if (pending) router.replace(successHref({ outcome: 'redirect-pending', ...pending }));
  }, [router]);
}
