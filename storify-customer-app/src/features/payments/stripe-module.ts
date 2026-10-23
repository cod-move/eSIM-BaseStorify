/**
 * Stripe's native module, loaded when a shopper pays by card, and not when the
 * screens that only show an outcome are: they never need it. `null` in a build
 * without it (Expo Go), which cannot show the sheet.
 */
export async function loadStripe() {
  try {
    return await import('@stripe/stripe-react-native');
  } catch {
    return null;
  }
}
