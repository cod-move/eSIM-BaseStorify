/**
 * Every key the app stores under, in one place so two features never share one
 * by accident. The prefix is the business app's own: on a phone that also has
 * the shopper app, and in a browser preview, the two never read each other's.
 */

/** Keys of `storage`: not encrypted, removed with the app. */
export const STORAGE_KEYS = {
  installId: 'storifybiz.install-id',
  locale: 'storifybiz.locale',
  /** The direction the app last restarted itself for; see i18n/direction. */
  directionRestart: 'storifybiz.direction-restart',
  theme: 'storifybiz.theme',
  queryCache: 'storifybiz.query-cache',
  /** The workspace an operator with two chose last; see features/workspace. */
  workspace: 'storifybiz.workspace',
  /** The app has asked, once, whether it may send notifications; see features/devices. */
  pushAsked: 'storifybiz.push-asked',
  /** Home shows its amounts as dots on this phone, by the operator's choice; see features/home. */
  homeAmountsHidden: 'storifybiz.home-amounts-hidden',
} as const;

/** Keys of `secureStorage`. Letters, digits, `.`, `-` and `_` only. */
export const SECURE_KEYS = {
  /** Prefix of the two keys the auth client writes: `storifybiz_cookie`, `storifybiz_session_data`. */
  authPrefix: 'storifybiz',
} as const;
