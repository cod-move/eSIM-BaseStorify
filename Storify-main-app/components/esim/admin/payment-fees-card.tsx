"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast-notification";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import { MAX_FEE_PERCENT, paymentFeeLabel, type PaymentFeeRule } from "@/lib/esim/payments/fee-rules";

/**
 * Payment fees (patch P29): what each checkout method adds to an order, a
 * fixed amount plus a percent of the goods. Shown at checkout as a "Payment
 * fee" line. Amounts are edited in dollars and stored in cents.
 */
export function EsimPaymentFeesCard({ fees, canManage, onSaved }: { fees: PaymentFeeRule[]; canManage: boolean; onSaved?: () => void }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [value, setValue] = useState(fees);
  const [saving, setSaving] = useState(false);
  const changed = JSON.stringify(value) !== JSON.stringify(fees);

  const update = (method: string, patch: Partial<PaymentFeeRule>) =>
    setValue((rules) => rules.map((rule) => (rule.method === method ? { ...rule, ...patch } : rule)));

  async function save() {
    setSaving(true);
    try {
      await apiClient.post("/api/esim/admin/payment-fees", { fees: value });
      toast.success(t("admin.esim.saved", "Saved"));
      if (onSaved) onSaved();
      else router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.esim.feesTitle", "Payment fees")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(
            "admin.esim.feesHint",
            "Added to an order for the way it is paid: a fixed amount plus a percent of the goods, shown at checkout as a \"Payment fee\" line and refunded with the order. Paying from the balance, and wallet top-ups, carry no fee.",
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-xs text-muted-foreground">
                <th className="py-2 pe-4 text-start font-medium">{t("admin.esim.feesMethod", "Method")}</th>
                <th className="py-2 pe-4 text-start font-medium">{t("admin.esim.feesFixed", "Fixed ($)")}</th>
                <th className="py-2 text-start font-medium">{t("admin.esim.feesPercent", "Percent (%)")}</th>
              </tr>
            </thead>
            <tbody>
              {value.map((rule) => (
                <tr key={rule.method} className="border-t">
                  <td className="py-2 pe-4">{paymentFeeLabel(rule.method)}</td>
                  <td className="py-2 pe-4">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-28"
                      aria-label={`${paymentFeeLabel(rule.method)} ${t("admin.esim.feesFixed", "Fixed ($)")}`}
                      disabled={!canManage}
                      value={(rule.fixedMinor / 100).toString()}
                      onChange={(event) => update(rule.method, { fixedMinor: Math.max(0, Math.round(Number(event.target.value) * 100) || 0) })}
                    />
                  </td>
                  <td className="py-2">
                    <Input
                      type="number"
                      min={0}
                      max={MAX_FEE_PERCENT}
                      step="0.1"
                      className="w-24"
                      aria-label={`${paymentFeeLabel(rule.method)} ${t("admin.esim.feesPercent", "Percent (%)")}`}
                      disabled={!canManage}
                      value={rule.percent}
                      onChange={(event) => update(rule.method, { percent: Math.max(0, Math.min(MAX_FEE_PERCENT, Number(event.target.value) || 0)) })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canManage ? (
          <Button size="sm" onClick={save} disabled={!changed || saving}>
            {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
            {t("common.save", "Save")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
