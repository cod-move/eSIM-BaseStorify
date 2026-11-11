/**
 * Switches for the official app's features the eSIM store turns off.
 *
 * `accountDeletion`: deleting the account from the app (Account → Security →
 * Delete account, and the `/account-deletion` link). Off: the row is hidden and
 * both screens send the shopper back to the account. Note that Apple (5.1.1(v))
 * and Google Play ask an app that lets people sign up to also let them delete
 * the account; turn this on again before a store review that asks for it.
 */
export const APP_FEATURES = {
  accountDeletion: false,
} as const;
