/** How a session was minted, from the Better Auth path that minted it (patch P61). Pure, for tests. */
export type SignInMethod =
  | "password"
  | "social"
  | "two-factor"
  | "sign-up"
  | "email-link"
  | "renewed"
  | "other";

export function signInMethod(path: string | null | undefined): SignInMethod {
  const value = (path ?? "").toLowerCase();
  if (!value) return "other";
  if (value.startsWith("/sign-in/email-otp")) return "email-link";
  if (
    value.startsWith("/sign-in/email") ||
    value.startsWith("/sign-in/username") ||
    value.startsWith("/sign-in/phone")
  )
    return "password";
  if (
    value.startsWith("/sign-in/social") ||
    value.startsWith("/callback/") ||
    value.startsWith("/oauth2/callback") ||
    value.startsWith("/sign-in/oauth2")
  )
    return "social";
  if (value.startsWith("/two-factor/verify")) return "two-factor";
  if (value.startsWith("/sign-up/")) return "sign-up";
  if (
    value.startsWith("/verify-email") ||
    value.startsWith("/magic-link/") ||
    value.startsWith("/email-otp/") ||
    value.startsWith("/sign-in/email-otp")
  )
    return "email-link";
  if (
    value.startsWith("/change-password") ||
    value.startsWith("/two-factor/") ||
    value.startsWith("/update-") ||
    value.startsWith("/reset-password") ||
    value.startsWith("/change-email")
  )
    return "renewed";
  return "other";
}
