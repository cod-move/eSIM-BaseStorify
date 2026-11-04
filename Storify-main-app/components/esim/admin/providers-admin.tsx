"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, PlugZap, RefreshCw, Save, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast-notification";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import type { AdminProvider } from "@/lib/esim/admin/providers";

/**
 * The supplier cards (ADM-01): on/off, priority, credentials, test the
 * connection, sync the catalogue. A secret is never sent back to the page —
 * its field shows whether one is set, and stays untouched unless typed into.
 */

function ProviderCard({ provider, canManage }: { provider: AdminProvider; canManage: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [priority, setPriority] = useState(String(provider.priority));
  const [currency, setCurrency] = useState(provider.settlementCurrency);
  const [credentials, setCredentials] = useState<Record<string, string>>(provider.credentialValues);
  const [busy, setBusy] = useState<"save" | "status" | "probe" | "sync" | null>(null);
  const [probe, setProbe] = useState(provider.lastProbe);
  const dateTime = (value: string) => new Date(value).toLocaleString();

  async function run(kind: NonNullable<typeof busy>, task: () => Promise<void>) {
    setBusy(kind);
    try {
      await task();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    run("save", async () => {
      const changed = Object.fromEntries(
        Object.entries(credentials).filter(([key, value]) => provider.secretKeys.includes(key) ? value !== "" : value !== (provider.credentialValues[key] ?? "")),
      );
      if (!/^[A-Z]{3}$/.test(currency)) throw new Error(t("admin.esim.providerCurrencyInvalid", "Enter a three-letter currency code, such as USD or EUR"));
      await apiClient.patch(`/api/esim/admin/providers/${provider.code}`, {
        priority: Number(priority) || 0,
        credentials: changed,
        ...(currency !== provider.settlementCurrency ? { settlementCurrency: currency } : {}),
      });
      setCredentials(provider.credentialValues);
      toast.success(t("admin.esim.saved", "Saved"));
    });

  const toggle = (on: boolean) =>
    run("status", async () => {
      await apiClient.patch(`/api/esim/admin/providers/${provider.code}`, { status: on ? "active" : "disabled" });
    });

  const testConnection = () =>
    run("probe", async () => {
      const result = await apiClient.post<{ ok: boolean; message: string }>(`/api/esim/admin/providers/${provider.code}/probe`, {});
      setProbe({ at: new Date().toISOString(), ok: result.ok, message: result.message });
      if (result.ok) toast.success(t("admin.esim.probeOk", "Connection works"));
      else toast.error(result.message);
    });

  const sync = () =>
    run("sync", async () => {
      const result = await apiClient.post<{ started: boolean; reason?: string }>(`/api/esim/admin/providers/${provider.code}/sync`, {});
      if (result.started) toast.success(t("admin.esim.syncStarted", "Sync started. It can take a few minutes; refresh to see progress."));
      else toast.info(result.reason ?? "");
    });

  const sync_ = provider.lastSync;
  const configured = Object.values(provider.credentialsSet).some(Boolean);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            {provider.name}
            <Badge variant={provider.status === "active" ? "default" : "secondary"}>
              {provider.status === "active" ? t("admin.esim.active", "On") : t("admin.esim.disabled", "Off")}
            </Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {provider.numbersOnly
              ? t("admin.esim.numbersOnlySupplier", "Number cards (stock imported under eSIM → Numbers)")
              : t("admin.esim.planCounts", "{total} plans · {active} switched on · {available} offered", provider.plans)}
            {" · "}
            {provider.settlementCurrency}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`status-${provider.code}`} className="text-sm">{t("admin.esim.selling", "Selling")}</Label>
          <Switch
            id={`status-${provider.code}`}
            checked={provider.status === "active"}
            disabled={!canManage || busy !== null || (!configured && provider.status !== "active")}
            onCheckedChange={toggle}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {provider.credentialKeys.map((key) => {
            const secret = provider.secretKeys.includes(key);
            return (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`${provider.code}-${key}`}>{key}</Label>
                <Input
                  id={`${provider.code}-${key}`}
                  type={secret ? "password" : "text"}
                  autoComplete="off"
                  disabled={!canManage}
                  value={credentials[key] ?? ""}
                  placeholder={secret ? (provider.credentialsSet[key] ? t("admin.esim.secretSet", "Set — type to replace") : t("admin.esim.secretUnset", "Not set")) : ""}
                  onChange={(event) => setCredentials((current) => ({ ...current, [key]: event.target.value }))}
                />
              </div>
            );
          })}
          {provider.numbersOnly ? null : <div className="space-y-1.5">
            <Label htmlFor={`${provider.code}-priority`}>{t("admin.esim.providerPriority", "Priority (lower is preferred when prices tie)")}</Label>
            <Input id={`${provider.code}-priority`} type="number" min={0} disabled={!canManage} value={priority} onChange={(event) => setPriority(event.target.value)} />
          </div>}
          <div className="space-y-1.5">
            <Label htmlFor={`${provider.code}-currency`}>{t("admin.esim.providerCurrency", "Currency (what the supplier bills in)")}</Label>
            <Input
              id={`${provider.code}-currency`}
              className="w-28 uppercase"
              maxLength={3}
              autoComplete="off"
              disabled={!canManage}
              value={currency}
              onChange={(event) => setCurrency(event.target.value.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 3))}
            />
            <p className="text-xs text-muted-foreground">
              {t("admin.esim.providerCurrencyHint", "Costs without a currency of their own are read in this currency and converted to USD at the exchange rate plus the buffer.")}
            </p>
          </div>
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg border p-3">
            <div className="mb-1 font-medium">{t("admin.esim.connection", "Connection")}</div>
            {probe ? (
              <div className="flex items-start gap-2">
                {probe.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                <div>
                  <div className="break-all">{probe.message}</div>
                  <div className="text-xs text-muted-foreground">{dateTime(probe.at)}</div>
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground">{t("admin.esim.neverTested", "Not tested yet")}</div>
            )}
          </div>
          {provider.numbersOnly ? null : <div className="rounded-lg border p-3">
            <div className="mb-1 font-medium">{t("admin.esim.lastSync", "Last catalogue sync")}</div>
            {sync_ ? (
              <div>
                <div className={sync_.status === "failed" ? "text-destructive" : ""}>
                  {sync_.status === "running"
                    ? t("admin.esim.syncRunning", "Running since {time}", { time: dateTime(sync_.startedAt) })
                    : sync_.status === "failed"
                      ? `${t("admin.esim.syncFailed", "Failed")}: ${sync_.error ?? ""}`
                      : t("admin.esim.syncResult", "{seen} seen · {created} new · {updated} changed · {retired} withdrawn", { seen: sync_.seen, created: sync_.created, updated: sync_.updated, retired: sync_.retired })}
                </div>
                {sync_.finishedAt ? <div className="text-xs text-muted-foreground">{dateTime(sync_.finishedAt)}</div> : null}
              </div>
            ) : (
              <div className="text-muted-foreground">{t("admin.esim.neverSynced", "Never synced")}</div>
            )}
          </div>}
        </div>

        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={busy !== null}>
              {busy === "save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {t("admin.esim.save", "Save")}
            </Button>
            <Button variant="outline" onClick={testConnection} disabled={busy !== null || !configured}>
              {busy === "probe" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
              {t("admin.esim.testConnection", "Test connection")}
            </Button>
            {provider.numbersOnly ? null : <Button variant="outline" onClick={sync} disabled={busy !== null || !configured || sync_?.status === "running"}>
              {busy === "sync" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {t("admin.esim.syncNow", "Sync catalogue")}
            </Button>}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function EsimProvidersAdmin({ providers, canManage }: { providers: AdminProvider[]; canManage: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("admin.sidebar.esimProviders", "Suppliers")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("admin.esim.providersHint", "The eSIM suppliers plans are bought from. A supplier that is off is neither synced nor sold.")}
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {providers.map((provider) => (
          <ProviderCard key={provider.code} provider={provider} canManage={canManage} />
        ))}
      </div>
    </div>
  );
}
