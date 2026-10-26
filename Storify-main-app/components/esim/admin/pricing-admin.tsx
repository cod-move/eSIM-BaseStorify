"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast-notification";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import type { AdminRule, PricingChange, RuleInput, SettingsInput } from "@/lib/esim/admin/pricing";

/**
 * Pricing (ADM-04, ADM-05). Every change is previewed first — how many
 * prices move, up or down, and the biggest moves — then saved, which
 * re-prices all plans not priced by hand.
 */

type Preview = {
  considered: number;
  changed: number;
  up: number;
  down: number;
  newlyPriced: number;
  activeChanged: number;
  averageChangePercent: number;
  biggest: Array<{ id: string; name: string; providerCode: string; from: number | null; to: number }>;
  missingRates: string[];
};

interface FxRow {
  currency: string;
  usdPerUnit: number | null;
  source: string | null;
  effectiveAt: string | null;
  plans: number;
}

interface Props {
  config: { settings: SettingsInput; rules: AdminRule[] };
  fx: { lastEcbDate: string | null; rates: FxRow[] };
  providers: Array<{ code: string; name: string }>;
  canManage: boolean;
}

const usd = (minor: number | null) =>
  minor === null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(minor / 100);

const EMPTY_RULE: RuleInput = { providerCode: null, countryCode: null, scope: null, markupPercent: 50, fixedMarkupMinor: 0, priority: 0, enabled: true, note: "" };

function PreviewPanel({ preview }: { preview: Preview }) {
  const t = useFallbackTranslator(useTranslations());
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
      <div className="font-medium">
        {preview.changed
          ? t("admin.esim.previewSummary", "{changed} of {considered} prices change: {up} up, {down} down ({avg}% on average); {active} of them are switched on.", {
              changed: preview.changed,
              considered: preview.considered,
              up: preview.up,
              down: preview.down,
              avg: preview.averageChangePercent,
              active: preview.activeChanged,
            })
          : t("admin.esim.previewNone", "No price changes.")}
      </div>
      {preview.newlyPriced ? <div>{t("admin.esim.previewNew", "{count} plans get their first price.", { count: preview.newlyPriced })}</div> : null}
      {preview.missingRates.length ? (
        <div className="text-destructive">{t("admin.esim.missingRates", "No exchange rate for {currencies}: those plans keep their price.", { currencies: preview.missingRates.join(", ") })}</div>
      ) : null}
      {preview.biggest.length ? (
        <ul className="space-y-0.5 text-xs">
          {preview.biggest.map((move) => (
            <li key={move.id} className="flex justify-between gap-3">
              <span className="truncate">
                {move.name} <span className="text-muted-foreground">({move.providerCode})</span>
              </span>
              <span className="whitespace-nowrap">
                {usd(move.from)} → <b>{usd(move.to)}</b>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function EsimPricingAdmin({ config, fx, providers, canManage }: Props) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [settings, setSettings] = useState<SettingsInput>(config.settings);
  const [settingsPreview, setSettingsPreview] = useState<Preview | null>(null);
  const [editing, setEditing] = useState<{ id?: string; values: RuleInput } | null>(null);
  const [rulePreview, setRulePreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  async function call<T>(key: string, task: () => Promise<T>): Promise<T | undefined> {
    setBusy(key);
    try {
      return await task();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  const preview = (change: PricingChange) => apiClient.post<Preview>("/api/esim/admin/pricing/preview", change);
  const save = async (change: PricingChange) => {
    const result = await apiClient.post<{ repriced: { changed: number } }>("/api/esim/admin/pricing", change);
    toast.success(t("admin.esim.repriced", "Saved. {count} plans re-priced; publish destinations to update the store.", { count: result.repriced.changed }));
    router.refresh();
  };

  const number = (value: string) => (value === "" ? 0 : Number(value));
  const settingsField = (key: keyof SettingsInput, label: string, hint?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`setting-${key}`}>{label}</Label>
      <Input
        id={`setting-${key}`}
        type="number"
        step="0.1"
        disabled={!canManage}
        value={String(settings[key])}
        onChange={(event) => {
          setSettingsPreview(null);
          setSettings((current) => ({ ...current, [key]: number(event.target.value) }));
        }}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );

  const ruleLabel = (rule: RuleInput) =>
    [
      rule.providerCode ? providers.find((provider) => provider.code === rule.providerCode)?.name ?? rule.providerCode : t("admin.esim.anySupplier", "Any supplier"),
      rule.scope ? t(`esim.browse.${rule.scope}`, rule.scope) : t("admin.esim.anyCoverage", "any coverage"),
      rule.countryCode ?? t("admin.esim.anyCountry", "any country"),
    ].join(" · ");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("admin.sidebar.esimPricing", "Pricing")}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "admin.esim.pricingHint",
            "Selling price = cost × exchange rate × (1 + buffer) × (1 + markup), never below the minimum margin, rounded up. The most specific enabled rule sets the markup.",
          )}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("admin.esim.settings", "Settings")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {settingsField("defaultMarkupPercent", t("admin.esim.defaultMarkup", "Default markup %"), t("admin.esim.defaultMarkupHint", "When no rule matches."))}
            {settingsField("minMarginPercent", t("admin.esim.minMargin", "Minimum margin %"), t("admin.esim.minMarginHint", "Of the selling price; protects against a low markup."))}
            {settingsField("fxBufferPercent", t("admin.esim.fxBuffer", "Exchange-rate buffer %"), t("admin.esim.fxBufferHint", "Added to the converted cost against rate swings."))}
            {settingsField("repriceThresholdPercent", t("admin.esim.threshold", "Re-price when a rate moves more than %"))}
            <div className="space-y-1.5">
              <Label htmlFor="setting-rounding">{t("admin.esim.rounding", "Rounding")}</Label>
              <NativeSelect
                id="setting-rounding"
                disabled={!canManage}
                value={settings.rounding}
                onChange={(event) => {
                  setSettingsPreview(null);
                  setSettings((current) => ({ ...current, rounding: event.target.value as SettingsInput["rounding"] }));
                }}
              >
                <option value="99">{t("admin.esim.round99", "Up to .99")}</option>
                <option value="49_99">{t("admin.esim.round4999", "Up to .49 or .99")}</option>
                <option value="none">{t("admin.esim.roundNone", "No rounding")}</option>
              </NativeSelect>
            </div>
          </div>
          {settingsPreview ? <PreviewPanel preview={settingsPreview} /> : null}
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy !== null} onClick={async () => setSettingsPreview((await call("settings-preview", () => preview({ settings }))) ?? null)}>
                {busy === "settings-preview" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                {t("admin.esim.preview", "Preview")}
              </Button>
              <Button disabled={busy !== null || !settingsPreview} onClick={() => call("settings-save", async () => { await save({ settings }); setSettingsPreview(null); })}>
                {busy === "settings-save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t("admin.esim.saveReprice", "Save and re-price")}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">{t("admin.esim.rules", "Markup rules")}</CardTitle>
          {canManage ? (
            <Button size="sm" onClick={() => { setRulePreview(null); setEditing({ values: { ...EMPTY_RULE } }); }}>
              <Plus className="mr-2 h-4 w-4" /> {t("admin.esim.addRule", "Add rule")}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {config.rules.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.esim.appliesTo", "Applies to")}</TableHead>
                  <TableHead className="text-right">{t("admin.esim.markup", "Markup")}</TableHead>
                  <TableHead className="text-right">{t("admin.esim.priority", "Priority")}</TableHead>
                  <TableHead className="text-right">{t("admin.esim.plansPriced", "Plans")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {config.rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <div>{ruleLabel(rule)}</div>
                      {rule.note ? <div className="text-xs text-muted-foreground">{rule.note}</div> : null}
                      {!rule.enabled ? <Badge variant="secondary">{t("admin.esim.disabled", "Off")}</Badge> : null}
                    </TableCell>
                    <TableCell className="text-right">
                      {rule.markupPercent}%{rule.fixedMarkupMinor ? ` + ${usd(rule.fixedMarkupMinor)}` : ""}
                    </TableCell>
                    <TableCell className="text-right">{rule.priority}</TableCell>
                    <TableCell className="text-right">{rule.plans}</TableCell>
                    <TableCell className="text-right">
                      {canManage ? (
                        <Button variant="ghost" size="sm" onClick={() => { setRulePreview(null); setEditing({ id: rule.id, values: { ...rule, note: rule.note ?? "" } }); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">{t("admin.esim.noRules", "No rules: every plan uses the default markup.")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">{t("admin.esim.fx", "Exchange rates")}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("admin.esim.fxHint", "European Central Bank rates, refreshed daily; latest {date}. A manual rate wins until removed.", { date: fx.lastEcbDate ?? "—" })}
            </p>
          </div>
          {canManage ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                call("fx-refresh", async () => {
                  const result = await apiClient.post<{ date: string; repriced: { changed: number } }>("/api/esim/admin/fx/refresh", {});
                  toast.success(t("admin.esim.fxRefreshed", "Rates of {date} loaded; {count} plans re-priced.", { date: result.date, count: result.repriced.changed }));
                  router.refresh();
                })
              }
            >
              {busy === "fx-refresh" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {t("admin.esim.fxRefresh", "Refresh now")}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.esim.currency", "Currency")}</TableHead>
                <TableHead className="text-right">{t("admin.esim.usdPerUnit", "USD per unit")}</TableHead>
                <TableHead>{t("admin.esim.source", "Source")}</TableHead>
                <TableHead className="text-right">{t("admin.esim.plansPriced", "Plans")}</TableHead>
                {canManage ? <TableHead>{t("admin.esim.override", "Manual rate")}</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {fx.rates.map((rate) => (
                <TableRow key={rate.currency}>
                  <TableCell className="font-medium">{rate.currency}</TableCell>
                  <TableCell className="text-right">{rate.usdPerUnit === null ? "—" : rate.usdPerUnit.toFixed(6)}</TableCell>
                  <TableCell>
                    {rate.source === "manual" ? <Badge>{t("admin.esim.manualRate", "Manual")}</Badge> : rate.source === "ecb" ? "ECB" : rate.source === "identity" ? "—" : <span className="text-destructive">{t("admin.esim.noRate", "Missing")}</span>}
                    {rate.effectiveAt ? <span className="ml-2 text-xs text-muted-foreground">{rate.effectiveAt.slice(0, 10)}</span> : null}
                  </TableCell>
                  <TableCell className="text-right">{rate.plans}</TableCell>
                  {canManage ? (
                    <TableCell>
                      {rate.currency === "USD" ? null : (
                        <div className="flex items-center gap-1.5">
                          <Input
                            className="h-8 w-28"
                            type="number"
                            step="0.000001"
                            placeholder={rate.usdPerUnit?.toFixed(4) ?? ""}
                            value={overrides[rate.currency] ?? ""}
                            onChange={(event) => setOverrides((current) => ({ ...current, [rate.currency]: event.target.value }))}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy !== null || !(Number(overrides[rate.currency]) > 0)}
                            onClick={() =>
                              call(`fx-${rate.currency}`, async () => {
                                await apiClient.put(`/api/esim/admin/fx/${rate.currency}`, { usdPerUnit: Number(overrides[rate.currency]) });
                                toast.success(t("admin.esim.saved", "Saved"));
                                setOverrides((current) => ({ ...current, [rate.currency]: "" }));
                                router.refresh();
                              })
                            }
                          >
                            {t("admin.esim.set", "Set")}
                          </Button>
                          {rate.source === "manual" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy !== null}
                              onClick={() =>
                                call(`fx-${rate.currency}`, async () => {
                                  await apiClient.put(`/api/esim/admin/fx/${rate.currency}`, { usdPerUnit: null });
                                  router.refresh();
                                })
                              }
                            >
                              {t("admin.esim.useEcb", "Use ECB")}
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? t("admin.esim.editRule", "Edit rule") : t("admin.esim.addRule", "Add rule")}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {t("admin.esim.ruleHint", "Leave a field on \"any\" to match everything. A rule naming more fields wins; between equals, the higher priority.")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t("admin.esim.supplier", "Supplier")}</Label>
                  <NativeSelect
                    value={editing.values.providerCode ?? ""}
                    onChange={(event) => { setRulePreview(null); setEditing({ ...editing, values: { ...editing.values, providerCode: event.target.value || null } }); }}
                  >
                    <option value="">{t("admin.esim.anySupplier", "Any supplier")}</option>
                    {providers.map((provider) => (
                      <option key={provider.code} value={provider.code}>{provider.name}</option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("admin.esim.coverage", "Coverage")}</Label>
                  <NativeSelect
                    value={editing.values.scope ?? ""}
                    onChange={(event) => { setRulePreview(null); setEditing({ ...editing, values: { ...editing.values, scope: (event.target.value || null) as RuleInput["scope"] } }); }}
                  >
                    <option value="">{t("admin.esim.anyCoverage", "any coverage")}</option>
                    <option value="local">{t("esim.browse.local", "Countries")}</option>
                    <option value="regional">{t("esim.browse.regional", "Regions")}</option>
                    <option value="global">{t("esim.browse.global", "Global")}</option>
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("admin.esim.country", "Country code")}</Label>
                  <Input
                    maxLength={2}
                    placeholder={t("admin.esim.anyCountry", "any country")}
                    value={editing.values.countryCode ?? ""}
                    onChange={(event) => { setRulePreview(null); setEditing({ ...editing, values: { ...editing.values, countryCode: event.target.value.toUpperCase() || null } }); }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("admin.esim.markupPercent", "Markup %")}</Label>
                  <Input
                    type="number"
                    value={String(editing.values.markupPercent)}
                    onChange={(event) => { setRulePreview(null); setEditing({ ...editing, values: { ...editing.values, markupPercent: number(event.target.value) } }); }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("admin.esim.fixedMarkup", "Plus a fixed amount (USD)")}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={String(editing.values.fixedMarkupMinor / 100)}
                    onChange={(event) => { setRulePreview(null); setEditing({ ...editing, values: { ...editing.values, fixedMarkupMinor: Math.round(number(event.target.value) * 100) } }); }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("admin.esim.priority", "Priority")}</Label>
                  <Input
                    type="number"
                    value={String(editing.values.priority)}
                    onChange={(event) => { setRulePreview(null); setEditing({ ...editing, values: { ...editing.values, priority: number(event.target.value) } }); }}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin.esim.note", "Note")}</Label>
                <Input value={editing.values.note ?? ""} maxLength={200} onChange={(event) => setEditing({ ...editing, values: { ...editing.values, note: event.target.value } })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="rule-enabled"
                  checked={editing.values.enabled}
                  onCheckedChange={(enabled) => { setRulePreview(null); setEditing({ ...editing, values: { ...editing.values, enabled } }); }}
                />
                <Label htmlFor="rule-enabled">{t("admin.esim.ruleEnabled", "Enabled")}</Label>
              </div>
              {rulePreview ? <PreviewPanel preview={rulePreview} /> : null}
            </div>
          ) : null}
          <DialogFooter className="flex-wrap gap-2">
            {editing?.id ? (
              <Button
                variant="ghost"
                className="text-destructive sm:mr-auto"
                disabled={busy !== null}
                onClick={() =>
                  call("rule-delete", async () => {
                    await save({ rule: { id: editing.id, remove: true } });
                    setEditing(null);
                  })
                }
              >
                <Trash2 className="mr-2 h-4 w-4" /> {t("admin.esim.deleteRule", "Delete")}
              </Button>
            ) : null}
            <Button
              variant="outline"
              disabled={busy !== null || !editing}
              onClick={async () => editing && setRulePreview((await call("rule-preview", () => preview({ rule: { id: editing.id, values: editing.values } }))) ?? null)}
            >
              {busy === "rule-preview" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
              {t("admin.esim.preview", "Preview")}
            </Button>
            <Button
              disabled={busy !== null || !rulePreview}
              onClick={() =>
                editing &&
                call("rule-save", async () => {
                  await save({ rule: { id: editing.id, values: { ...editing.values, note: editing.values.note || undefined } } });
                  setEditing(null);
                })
              }
            >
              {t("admin.esim.saveReprice", "Save and re-price")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
