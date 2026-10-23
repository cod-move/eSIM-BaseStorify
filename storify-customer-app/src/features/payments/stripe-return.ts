import { resolveScheme } from 'expo-linking';

/**
 * Where a bank's check (3-D Secure) or a bank's own app sends the shopper back
 * to, while the Payment Sheet waits: an address of the app's own scheme, the
 * one in `app.json` (or `APP_SCHEME` for a second brand). It opens no screen.
 */
export const STRIPE_RETURN_PATH = 'stripe-redirect';

/** The app's scheme, as the build was made with it. */
export const appScheme = (): string => resolveScheme({});

/**
 * The return address the sheet is opened with. It is built from the scheme
 * alone: `createURL` puts the development server's address into it in a
 * development build, and the bank would send the shopper nowhere.
 */
export function stripeReturnUrl(scheme: string = appScheme()): string {
  return `${scheme}://${STRIPE_RETURN_PATH}`;
}

/**
 * Whether an address that opened the app is Stripe's way back: the sheet
 * takes it, and the screen under the sheet stays where it is.
 */
export function isStripeReturn(url: string): boolean {
  const path = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^\/+/, '');
  return new RegExp(`^${STRIPE_RETURN_PATH}/?([?#].*)?$`).test(path);
}
