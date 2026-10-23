import { isStripeReturn } from '@/features/payments/stripe-return';
import { resolveAppLink, toAppPath } from '@/lib/links';

/**
 * Every link that opens the app from outside passes through here first: a
 * universal link (`https://shop.example.com/bn/products/red-shoe`) or the app's
 * own scheme (`storify://products/red-shoe`). The website's address and the
 * language in front are dropped; what is left is a path of the app.
 *
 * A link to the website opens a screen only when its path is in the contract's
 * link table; any other page of the website opens as a web page inside the
 * app (`/web`). A link of the app's own scheme is the app's own
 * address and goes to the router as it is.
 *
 * This runs before the app has started, outside React: it must not throw.
 * `null` opens no screen: Stripe's way back after a bank's check belongs to the
 * Payment Sheet, and checkout stays where it is under it.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  try {
    if (isStripeReturn(path)) return null;
    // Expo's development launcher opens the app with an address of its own.
    if (path.includes('expo-development-client')) return path;
    if (/^https?:\/\//i.test(path)) {
      const screen = resolveAppLink(path);
      if (screen) return screen;
      return `/web?url=${encodeURIComponent(path)}`;
    }
    return toAppPath(path);
  } catch {
    return '/';
  }
}
