"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast-notification";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import type { WalletSettings } from "@/lib/esim/admin/wallet";

/**
 * Wallet top-ups (WAL-01): shoppers add money to their balance through
 * checkout. On/off, the smallest and largest amount, and the fee added on top.
 * Amounts are edited in dollars and stored in cents.
 */
export function EsimWalletSettingsCard({ settings, canManage }: { settings: WalletSettings; canManage: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [value, setValue] = useState(settings);
  const [saving, setSaving] = useState(false);
  const changed = JSON.stringify(value) !== JSON.stringify(settings);

  async function save() {
    setSaving(true);
    try {
      await apiClient.post("/api/esim/admin/wallet", value);
      toast.success(t("admin.esim.saved", "Saved"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  const dollars = (key: "minMinor" | "maxMinor" | "feeFixedMinor", label: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`wallet-${key}`}>{label}</Label>
      <Input
        id={`wallet-${key}`}
        type="number"
        min={0}
        step="0.01"
        className="w-32"
        disabled={!canManage}
        value={(value[key] / 100).toString()}
        onChange={(event) => setValue({ ...value, [key]: Math.max(0, Math.round(Number(event.target.value) * 100) || 0) })}
      />
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">{t("admin.esim.walletTitle", "Wallet top-ups")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("admin.esim.walletHint", "Shoppers add money to their balance from My eSIMs and pay for it at checkout. The amount is booked as balance owed to them, the fee as income; balance added this way is not refunded as money.")}
          </p>
        </div>
        <Switch checked={value.enabled} disabled={!canManage} onCheckedChange={(enabled) => setValue({ ...value, enabled })} aria-label={t("admin.esim.walletEnabled", "Allow wallet top-ups")} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-4">
          {dollars("minMinor", t("admin.esim.walletMin", "Smallest amount"))}
          {dollars("maxMinor", t("admin.esim.walletMax", "Largest amount"))}
          {dollars("feeFixedMinor", t("admin.esim.walletFeeFixed", "Fixed fee"))}
          <div className="space-y-1.5">
            <Label htmlFor="wallet-feePercent">{t("admin.esim.walletFeePercent", "Fee %")}</Label>
            <Input
              id="wallet-feePercent"
              type="number"
              min={0}
              max={50}
              step="0.1"
              className="w-24"
              disabled={!canManage}
              value={value.feePercent}
              onChange={(event) => setValue({ ...value, feePercent: Math.max(0, Math.min(50, Number(event.target.value) || 0)) })}
            />
          </div>
        </div>
        {canManage ? (
          <Button size="sm" onClick={save} disabled={!changed || saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("common.save", "Save")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
