/**
 * Every key the app stores under, in one place so two features never share one
 * by accident.
 */

/** Keys of `storage`: not encrypted, removed with the app. */
export const STORAGE_KEYS = {
  installId: 'storify.install-id',
  locale: 'storify.locale',
  /** The direction the app last restarted itself for; see i18n/direction. */
  directionRestart: 'storify.direction-restart',
  theme: 'storify.theme',
  /** The accent colour the shopper picked on Profile; see theme/accents. Absent means the store's. */
  accent: 'storify.accent',
  queryCache: 'storify.query-cache',
  /** What the shopper searched for lately; see features/search/recent-searches. */
  recentSearches: 'storify.recent-searches',
  /** The products the shopper opened lately. */
  recentlyViewed: 'storify.recently-viewed',
  /** The products picked to compare, as slugs in column order; see features/compare/compare-tray. */
  compare: 'storify.compare',
  /** When the app last asked the shopper to rate it. */
  ratingAskedAt: 'storify.rating-asked-at',
  /** Set once the app has explained push notifications after an order; it never asks again on its own. */
  pushAsked: 'storify.push-asked',
} as const;

/** Keys of `secureStorage`. Letters, digits, `.`, `-` and `_` only. */
export const SECURE_KEYS = {
  cartToken: 'storify.cart-token',
  /** The payment the shopper left the app to make, until its outcome is known. */
  pendingPayment: 'storify.pending-payment',
  /** Prefix of the two keys the auth client writes: `storify_cookie`, `storify_session_data`. */
  authPrefix: 'storify',
} as const;
