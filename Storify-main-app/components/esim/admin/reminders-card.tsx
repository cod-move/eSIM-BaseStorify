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
import type { ReminderSettings } from "@/lib/esim/reminders/policy";

/**
 * The shopper reminders the usage job sends (NTF-03/04/05/07): on or off,
 * and when low data, a plan's end and the install-by date are warned about.
 */
export function EsimRemindersCard({ settings, canManage }: { settings: ReminderSettings; canManage: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [value, setValue] = useState(settings);
  const [saving, setSaving] = useState(false);
  const changed = JSON.stringify(value) !== JSON.stringify(settings);

  async function save() {
    setSaving(true);
    try {
      await apiClient.post("/api/esim/admin/reminders", value);
      toast.success(t("admin.esim.saved", "Saved"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  const number = (key: "lowDataPercent" | "expiringHours" | "installDays", label: string, suffix: string, max: number) => (
    <div className="space-y-1.5">
      <Label htmlFor={`reminder-${key}`}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={`reminder-${key}`}
          type="number"
          min={1}
          max={max}
          className="w-24"
          disabled={!canManage || !value.enabled}
          value={value[key]}
          onChange={(event) => setValue({ ...value, [key]: Math.max(1, Math.min(max, Number(event.target.value) || 1)) })}
        />
        <span className="text-sm text-muted-foreground">{suffix}</span>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">{t("admin.esim.remindersTitle", "Shopper reminders")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("admin.esim.remindersHint", "Sent by the usage job by email, and in the account for registered shoppers: when the eSIM connects, when data runs low (with a top-up link), before the plan ends and before the install-by date. Each is sent once.")}
          </p>
        </div>
        <Switch
          checked={value.enabled}
          disabled={!canManage}
          onCheckedChange={(enabled) => setValue({ ...value, enabled })}
          aria-label={t("admin.esim.remindersEnabled", "Send reminders")}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          {number("lowDataPercent", t("admin.esim.reminderLowData", "Low data at"), t("admin.esim.reminderPercentLeft", "% left"), 90)}
          {number("expiringHours", t("admin.esim.reminderExpiring", "Plan ending"), t("admin.esim.reminderHoursBefore", "hours before"), 336)}
          {number("installDays", t("admin.esim.reminderInstall", "Not installed"), t("admin.esim.reminderDaysBefore", "days before the install-by date"), 60)}
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
