"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast-notification";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import type { RiskSettingsInput } from "@/lib/esim/admin/risk";

/**
 * Order review (ORD-13): a paid order whose eSIMs wait for a person under
 * eSIM → Problems before anything is bought from a supplier — a large order,
 * or a buyer ordering again and again. 0 turns a rule off.
 */
export function EsimRiskSettingsCard({ settings, canManage }: { settings: RiskSettingsInput; canManage: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [value, setValue] = useState(settings);
  const [saving, setSaving] = useState(false);
  const changed = JSON.stringify(value) !== JSON.stringify(settings);
  const whole = (text: string, max: number) => Math.max(0, Math.min(max, Math.round(Number(text)) || 0));

  async function save() {
    setSaving(true);
    try {
      await apiClient.post("/api/esim/admin/risk", value);
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
      <CardHeader>
        <CardTitle className="text-base">{t("admin.esim.riskTitle", "Order review")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(
            "admin.esim.riskHint",
            "Hold a paid order's eSIMs for a person before anything is bought from a supplier. Held orders appear under eSIM → Problems, to approve or reject. 0 turns a rule off.",
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="risk-over">{t("admin.esim.riskOver", "Review orders of at least")}</Label>
            <Input
              id="risk-over"
              type="number"
              min={0}
              step="0.01"
              className="w-32"
              disabled={!canManage}
              value={(value.reviewOverMinor / 100).toString()}
              onChange={(event) => setValue({ ...value, reviewOverMinor: Math.max(0, Math.round(Number(event.target.value) * 100) || 0) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="risk-orders">{t("admin.esim.riskOrders", "Review once a buyer already has this many orders")}</Label>
            <Input
              id="risk-orders"
              type="number"
              min={0}
              max={1000}
              className="w-24"
              disabled={!canManage}
              value={value.maxOrders}
              onChange={(event) => setValue({ ...value, maxOrders: whole(event.target.value, 1000) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="risk-window">{t("admin.esim.riskWindow", "…within this many hours")}</Label>
            <Input
              id="risk-window"
              type="number"
              min={1}
              max={720}
              className="w-24"
              disabled={!canManage}
              value={value.windowHours}
              onChange={(event) => setValue({ ...value, windowHours: Math.max(1, whole(event.target.value, 720)) })}
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
