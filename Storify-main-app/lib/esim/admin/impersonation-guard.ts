/**
 * While an admin is signed in as a customer (lib/esim/admin/impersonation.ts),
 * the browser carries a marker cookie, and these requests are refused at the
 * edge (proxy.ts, patch P60): looking around is the point; paying, moving
 * money and changing the account's password, email or security are not.
 *
 * Pure, so the proxy can use it and the rules are tested on their own. The
 * marker only ever blocks: a shopper who forges it locks themselves out of
 * checkout and nothing else.
 */

/** The marker cookie's name after Better Auth's prefix (`better-auth.`, `__Secure-better-auth.`). */
export const IMPERSONATION_COOKIE = "esim_impersonator";

/** How long an admin may stay signed in as a customer. */
export const IMPERSONATION_SECONDS = 60 * 60;

export function hasImpersonationMarker(cookieNames: Iterable<string>): boolean {
  for (const name of cookieNames) {
    if (name === IMPERSONATION_COOKIE || name.endsWith(`.${IMPERSONATION_COOKIE}`)) return true;
  }
  return false;
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Better Auth endpoints that change who can get into the account. */
const AUTH_BLOCKED = [
  "/api/auth/change-password",
  "/api/auth/change-email",
  "/api/auth/set-password",
  "/api/auth/delete-user",
  "/api/auth/two-factor/",
  "/api/auth/revoke-session",
  "/api/auth/link-social",
  "/api/auth/unlink-account",
  "/api/auth/update-user",
];

/** Everything that pays, moves money or changes the account, under these. */
const BLOCKED_PREFIXES = [
  "/api/payments/",
  "/api/orders",
  "/api/checkout/store-credit",
  "/api/esim/pay/",
  "/api/esim/checkout/",
  "/api/esim/me/",
  "/api/user/change-password",
  "/api/user/profile",
];

/** Looking again at what is already there is fine. */
const ALLOWED = [/^\/api\/esim\/me\/(esims|numbers)\/[^/]+\/refresh$/];

/** Whether a request is refused while an admin is signed in as a customer. */
export function blockedWhileImpersonating(method: string, pathname: string): boolean {
  if (READ_METHODS.has(method.toUpperCase())) return false;
  if (ALLOWED.some((pattern) => pattern.test(pathname))) return false;
  return [...AUTH_BLOCKED, ...BLOCKED_PREFIXES].some((prefix) => {
    const base = prefix.replace(/\/$/, "");
    return pathname === base || pathname.startsWith(`${base}/`);
  });
}
