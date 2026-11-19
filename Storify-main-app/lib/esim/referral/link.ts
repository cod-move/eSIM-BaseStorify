/**
 * Invite links on any page (REF-01): `/<any page>?ref=<code>` is sent on to
 * `/esim/invite/<code>?to=<that page>`, which keeps the code in a cookie and
 * lands the visitor back on the page they were sent, without the `ref`.
 *
 * No database here: the request entry (proxy, patch P80) only reshapes the
 * address; the invite route checks the code.
 */

const CODE_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;

/** The invite route for a page address carrying `?ref=`; null when there is nothing to do. */
export function inviteRedirectFor(pathname: string, search: string): string | null {
  if (pathname.startsWith("/api/") || /\/esim\/invite(\/|$)/.test(pathname)) return null;
  const params = new URLSearchParams(search);
  const code = params.get("ref")?.trim();
  if (!code || !CODE_PATTERN.test(code)) return null;
  params.delete("ref");
  const rest = params.toString();
  const to = `${pathname}${rest ? `?${rest}` : ""}`;
  return `/esim/invite/${encodeURIComponent(code)}?to=${encodeURIComponent(to)}`;
}

/**
 * The site's address as the visitor typed it: the reverse proxy's
 * `X-Forwarded-Host`/`-Proto`, else `Host`, else `fallback`. Behind nginx the
 * request's own URL is the address Next listens on (http://localhost:3000).
 */
export function publicOrigin(headers: Headers, fallback: string): string {
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim();
  if (!host || !/^[A-Za-z0-9.-]+(:\d+)?$/.test(host)) return fallback;
  const forwarded = headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const proto = forwarded === "http" || forwarded === "https" ? forwarded : new URL(fallback).protocol.replace(":", "");
  return `${proto}://${host}`;
}

/** Where the invite route sends the visitor: a page of this site only, else `fallback`. */
export function safeReturnPath(to: string | null | undefined, fallback: string): string {
  if (!to || !to.startsWith("/") || to.startsWith("//") || to.includes("\\") || /[\r\n]/.test(to)) return fallback;
  if (/\/esim\/invite(\/|$)/.test(to.split("?")[0])) return fallback;
  return to;
}
