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
import type { NumberSettingsInput } from "@/lib/esim/numbers/settings";

/**
 * Number-card settings (NUM-04/08) on Admin → eSIM → Numbers: the smallest
 * recharge, a whole amount in the card's currency. Every number is sold
 * with a first recharge of at least this much; later recharges too.
 */
export function EsimNumberSettingsCard({ settings, canManage }: { settings: NumberSettingsInput & { currency: string }; canManage: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [amount, setAmount] = useState(String(settings.rechargeMinMinor / 100));
  const [saving, setSaving] = useState(false);
  const units = Number(amount);
  const valid = /^\d{1,3}$/.test(amount) && units >= 1 && units <= 300;
  const changed = units * 100 !== settings.rechargeMinMinor;

  async function save() {
    setSaving(true);
    try {
      await apiClient.post("/api/esim/admin/number-settings", { rechargeMinMinor: units * 100 });
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
        <CardTitle className="text-base">{t("admin.esim.numberSettingsTitle", "Recharge")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(
            "admin.esim.numberSettingsHint",
            "Every number is sold with a first recharge. The smallest recharge applies to that first one and to later ones: whole amounts in the card's currency ({currency}).",
            { currency: settings.currency },
          )}
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="number-recharge-min">
            {t("admin.esim.rechargeMin", "Smallest recharge")} ({settings.currency})
          </Label>
          <Input
            id="number-recharge-min"
            inputMode="numeric"
            className="w-28"
            disabled={!canManage}
            value={amount}
            aria-invalid={!valid}
            onChange={(event) => setAmount(event.target.value.replace(/\D/g, "").slice(0, 3))}
          />
        </div>
        {canManage ? (
          <Button size="sm" onClick={save} disabled={!valid || !changed || saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("common.save", "Save")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
