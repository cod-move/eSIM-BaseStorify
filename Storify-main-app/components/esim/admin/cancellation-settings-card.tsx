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
import type { CancellationSettings } from "@/lib/esim/admin/cancellation";

/**
 * Shopper cancellation (USR-07): a shopper may cancel an eSIM not installed
 * yet on a plan its supplier marks refundable, at a supplier that cancels
 * through its API. The fee is kept; the rest goes to the balance, or is
 * refunded by hand to the original payment.
 */
export function EsimCancellationSettingsCard({ settings, canManage }: { settings: CancellationSettings; canManage: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [value, setValue] = useState(settings);
  const [saving, setSaving] = useState(false);
  const changed = JSON.stringify(value) !== JSON.stringify(settings);

  async function save() {
    setSaving(true);
    try {
      await apiClient.post("/api/esim/admin/cancellation", value);
      toast.success(t("admin.esim.saved", "Saved"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">{t("admin.esim.cancelTitle", "Cancellation by the shopper")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t(
              "admin.esim.cancelHint",
              "A shopper can cancel an eSIM not installed yet, on a plan its supplier marks refundable, when the supplier cancels through its API. The supplier is asked first; the shopper is refunded only once it agrees.",
            )}
          </p>
        </div>
        <Switch checked={value.enabled} disabled={!canManage} onCheckedChange={(enabled) => setValue({ ...value, enabled })} aria-label={t("admin.esim.cancelEnabled", "Allow cancellation")} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="cancel-feeFixed">{t("admin.esim.cancelFeeFixed", "Fixed fee kept")}</Label>
            <Input
              id="cancel-feeFixed"
              type="number"
              min={0}
              step="0.01"
              className="w-32"
              disabled={!canManage}
              value={(value.feeFixedMinor / 100).toString()}
              onChange={(event) => setValue({ ...value, feeFixedMinor: Math.max(0, Math.round(Number(event.target.value) * 100) || 0) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-feePercent">{t("admin.esim.cancelFeePercent", "Fee % kept")}</Label>
            <Input
              id="cancel-feePercent"
              type="number"
              min={0}
              max={100}
              step="0.1"
              className="w-24"
              disabled={!canManage}
              value={value.feePercent}
              onChange={(event) => setValue({ ...value, feePercent: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-refundTo">{t("admin.esim.cancelRefundTo", "Refund to")}</Label>
            <select
              id="cancel-refundTo"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              disabled={!canManage}
              value={value.refundTo}
              onChange={(event) => setValue({ ...value, refundTo: event.target.value as CancellationSettings["refundTo"] })}
            >
              <option value="balance">{t("admin.esim.cancelToBalance", "The shopper's balance")}</option>
              <option value="original">{t("admin.esim.cancelToOriginal", "The original payment (by hand)")}</option>
            </select>
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
