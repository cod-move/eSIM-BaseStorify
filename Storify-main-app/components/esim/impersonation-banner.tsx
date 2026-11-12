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
  const impersonatedBy = (data?.session as { impersonatedBy?: string | null } | undefined)?.impersonatedBy;
  if (!data || !impersonatedBy) return null;

  const leave = async () => {
    setLeaving(true);
    const response = await fetch("/api/auth/esim/stop-impersonating", { method: "POST", credentials: "include" }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { restored?: boolean } | null;
    window.location.assign(body?.restored ? `/${locale}/admin/customers` : `/${locale}/login`);
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
        ).replace("{email}", data.user.email)}
      </span>
      <button
        type="button"
        onClick={leave}
        disabled={leaving}
        className="rounded-md bg-amber-950 px-3 py-0.5 text-xs font-semibold text-amber-50 hover:bg-amber-900 disabled:opacity-60"
      >
        {leaving ? t("esim.impersonation.returning", "Returning…") : t("esim.impersonation.return", "Return to admin")}
      </button>
    </div>
  );
}
