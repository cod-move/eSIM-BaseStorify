import { REDIRECT_PAYMENT_METHODS, type RedirectPaymentMethod } from '@/contracts/mobile/shop/v1';
import { secureStorage } from '@/lib/secure-storage';

import { redirectPending } from './redirect-pending';

/**
 * The way back from a gateway's page (APP-09, patch P58): the app link
 * `{scheme}://checkout/return/{provider}?…` that the store's bridge opens.
 *
 * It belongs to the payment waiting for it (`payByRedirect`), not to the
 * router: the app has no screen at that address, so opened as a screen it was
 * "page not found".
 */
const RETURN_PATH = /^checkout\/return\/[^/?#]+\/?([?#].*)?$/;

export function isRedirectReturn(url: string): boolean {
  const path = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^\/+/, '');
  return RETURN_PATH.test(path);
}

/** The eSIM module's own key of `secureStorage`: the page the shopper is on right now. */
const KEY = 'storify.esim.redirect-started';

/**
 * A payment whose page is open. Android may close the app while the shopper
 * is in the browser; the link back then starts it afresh, and the payment that
 * was waiting is gone with it. This is how the new start knows which payment
 * to ask the store about.
 */
export const redirectStarted = {
  write(started: { method: RedirectPaymentMethod; reference: string }): void {
    secureStorage.setItem(KEY, JSON.stringify(started));
  },
  clear(): void {
    secureStorage.removeItem(KEY);
  },
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
      // Unreadable: nothing to resume.
    }
    return null;
  },
};

/**
 * The screen a return link opens. While the app runs, none: the payment
 * waiting for the link takes it and shows the outcome. On a fresh start, the
 * payment left open is handed to checkout, which asks the store how it ended.
 */
export function returnScreen(initial: boolean): string | null {
  if (!initial) return null;
  const started = redirectStarted.read();
  redirectStarted.clear();
  if (started) redirectPending.write(started);
  return '/checkout';
}
