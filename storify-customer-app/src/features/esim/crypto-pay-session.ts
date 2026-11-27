import { router } from 'expo-router';

/**
 * The app's own payment screen for the eSIM payment page's methods (APP-09),
 * as one step of `payByRedirect`: the screen is opened and waited for, the way
 * the in-app browser is.
 *
 * - `page`: a method the app does not pay itself was chosen; it is paid on the
 *   eSIM payment page, started at once there (`?method=`).
 * - `done`: the screen is left, by the shopper or because the payment is in.
 *   `paying`: an address was shown, so money may be on its way.
 */
export type NativePayEnd = { kind: 'page'; method: string } | { kind: 'done'; paying: boolean };

let waiting: ((end: NativePayEnd) => void) | null = null;

/** The `?ref=` the screen is opened with: the checkout's reference, as the page's path has it. */
export function checkoutRefOf(pageUrl: string): string | null {
  return /\/esim\/pay\/(ext[0-9a-f]{24})(?:[/?#]|$)/.exec(pageUrl)?.[1] ?? null;
}

/** Opens the screen and waits until it is left. */
export function payInApp(checkoutRef: string): Promise<NativePayEnd> {
  waiting?.({ kind: 'done', paying: false });
  return new Promise((resolve) => {
    waiting = resolve;
    router.push({ pathname: '/checkout/esim-pay', params: { ref: checkoutRef } });
  });
}

/** The screen's end; only the first counts. */
export function endPayInApp(end: NativePayEnd) {
  const resolve = waiting;
  waiting = null;
  resolve?.(end);
}

/** Whether a payment is waiting for the screen (one opened by a stale link has nothing to tell). */
export function payInAppWaiting(): boolean {
  return waiting !== null;
}
