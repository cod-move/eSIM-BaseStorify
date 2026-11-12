"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { toast } from "@/components/ui/toast-notification";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";

/**
 * "Sign in as this customer" on the admin customer page (patch P60): opens the
 * store as the customer for an hour (lib/esim/admin/impersonation.ts). The
 * admin's own session is swapped out in this browser until they return from
 * the banner on the store.
 */
export function ImpersonateButton({ userId, email, locale }: { userId: string; email: string | null; locale: string }) {
  const t = useFallbackTranslator(useTranslations());
  const { confirm } = useConfirmation();
  const [busy, setBusy] = useState(false);

  const start = async () => {
    const ok = await confirm({
      title: t("admin.esim.impersonate.title", "Sign in as this customer?"),
      description: t(
        "admin.esim.impersonate.description",
        "You will see the store as {email} for up to an hour. Paying, topping up and changing the account are blocked. This is recorded in the audit log. Return to the admin from the banner at the top of the store.",
      ).replace("{email}", email ?? "this customer"),
      confirmText: t("admin.esim.impersonate.confirm", "Sign in as customer"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const response = await fetch("/api/auth/esim/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message || `HTTP ${response.status}`);
      }
      // A full load: the session just changed, so nothing of the admin may stay in memory.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/${locale}/account`);
    } catch (error) {
      setBusy(false);
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={start} disabled={busy}>
      <LogIn className="mr-1.5 h-4 w-4" />
      {t("admin.esim.impersonate.button", "Sign in as customer")}
    </Button>
  );
}
