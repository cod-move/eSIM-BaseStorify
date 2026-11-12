"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "@/lib/auth/auth-client";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";

/**
 * On every store page while an admin is signed in as a customer (patch P60):
 * whose account this is, and the way back to the admin
 * (lib/esim/admin/impersonation.ts). Nothing for anyone else.
 */
export function ImpersonationBanner({ locale }: { locale: string }) {
  const t = useFallbackTranslator(useTranslations());
  const { data } = useSession();
  const [leaving, setLeaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [loginHref, setLoginHref] = useState<string | null>(null);
  const impersonatedBy = (
    data?.session as { impersonatedBy?: string | null } | undefined
  )?.impersonatedBy;
  if (!data || !impersonatedBy) return null;

  const leave = async () => {
    setLeaving(true);
    setProblem(null);
    const response = await fetch("/api/auth/esim/stop-impersonating", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as {
      restored?: boolean;
      reason?: string;
      message?: string;
      error?: string;
    } | null;
    if (!response?.ok) {
      // Say why, rather than landing somewhere unexpected.
      setProblem(
        `${response ? `HTTP ${response.status}` : "Network error"}${body?.message || body?.error ? `: ${body.message || body.error}` : ""}`,
      );
      setLeaving(false);
      return;
    }
    // A full load, so the admin's session is read fresh. The default language has no prefix in the
    // address (next-intl "as-needed"): keep the one the page has, if any.
    const path = window.location.pathname;
    const prefix =
      path === `/${locale}` || path.startsWith(`/${locale}/`)
        ? `/${locale}`
        : "";
    if (body?.restored) {
      // A full load on purpose: the session just changed, and a client navigation would keep the customer's.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`${prefix}/admin/customers`);
      return;
    }
    // The customer's session is closed but the admin's could not be put back: say why, then sign in again.
    setProblem(
      t(
        "esim.impersonation.notRestored",
        "Could not return to the admin ({reason}). Please sign in again.",
        {
          reason: body?.reason ?? "unknown",
        },
      ),
    );
    setLoginHref(`${prefix}/login`);
    setLeaving(false);
  };

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[1000] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500 px-4 py-1.5 text-center text-sm font-medium text-amber-950 shadow"
    >
      <span>
        {t(
          "esim.impersonation.viewing",
          "Signed in as {email} from the admin. Paying and account changes are blocked.",
          { email: data.user.email || data.user.name || "—" },
        )}
      </span>
      {problem ? <span className="text-xs text-red-900">{problem}</span> : null}
      {loginHref ? (
        <a
          href={loginHref}
          className="rounded-md bg-amber-950 px-3 py-0.5 text-xs font-semibold text-amber-50 hover:bg-amber-900"
        >
          {t("esim.impersonation.signInAgain", "Sign in again")}
        </a>
      ) : (
        <button
          type="button"
          onClick={leave}
          disabled={leaving}
          className="rounded-md bg-amber-950 px-3 py-0.5 text-xs font-semibold text-amber-50 hover:bg-amber-900 disabled:opacity-60"
        >
          {leaving
            ? t("esim.impersonation.returning", "Returning…")
            : t("esim.impersonation.return", "Return to admin")}
        </button>
      )}
    </div>
  );
}
