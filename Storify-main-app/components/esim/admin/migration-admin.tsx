"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { DatabaseZap, Loader2, SearchCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast-notification";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import type { MigrationRunView, MigrationStatus } from "@/lib/esim/admin/migration";

/**
 * The import from the old store (MIG): check first, then import. Either runs
 * in the background; the page refreshes itself while one is running. Running
 * the import again is safe — what was imported is skipped.
 */

function Counts({ values }: { values: Record<string, number> | null }) {
  const entries = Object.entries(values ?? {}).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return <span className="text-muted-foreground">—</span>;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="font-mono text-xs text-muted-foreground">{key}</dt>
          <dd>{key.endsWith("Minor") ? (value / 100).toFixed(2) : value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RunCard({ run }: { run: MigrationRunView }) {
  const t = useFallbackTranslator(useTranslations());
  const when = (value: string | null) => (value ? new Date(value).toLocaleString() : "—");
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0 pb-2">
        <CardTitle className="text-base">{run.apply ? t("admin.esim.migImport", "Import") : t("admin.esim.migCheck", "Check")}</CardTitle>
        <Badge variant={run.status === "failed" ? "destructive" : run.status === "running" ? "secondary" : "default"}>
          {run.status === "running" ? t("admin.esim.migRunning", "Running") : run.status === "failed" ? t("admin.esim.migFailed", "Failed") : t("admin.esim.migDone", "Done")}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {when(run.startedAt)} · {run.startedBy}
          {run.finishedAt ? ` → ${when(run.finishedAt)}` : ""}
        </span>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {run.error ? <p className="text-sm text-destructive sm:col-span-2">{run.error}</p> : null}
        <div>
          <div className="mb-1 text-sm font-medium">{run.apply ? t("admin.esim.migDid", "Done") : t("admin.esim.migWould", "Would do")}</div>
          <Counts values={run.report} />
        </div>
        <div>
          <div className="mb-1 text-sm font-medium">{t("admin.esim.migSkipped", "Left out")}</div>
          <Counts values={run.skipped} />
        </div>
      </CardContent>
    </Card>
  );
}

export function EsimMigrationAdmin({ status, canManage }: { status: MigrationStatus; canManage: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const { confirm } = useConfirmation();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!status.running) return;
    const timer = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [status.running, router]);

  async function start(apply: boolean) {
    if (apply) {
      const ok = await confirm({
        title: t("admin.esim.confirm", "Are you sure?"),
        description: t(
          "admin.esim.migConfirm",
          "Import the old store's shoppers, balances, referrals and active eSIMs now? Shoppers are not emailed. Running it again later only adds what is new.",
        ),
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await apiClient.post("/api/esim/admin/migration", { apply });
      toast.success(t("admin.esim.migStarted", "Started; this page updates when it is done"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("admin.sidebar.esimMigration", "Migration")}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "admin.esim.migHint",
            "Brings email-verified, not banned shoppers (with their old passwords), their balances, who referred whom, and the whole number-card stock (unsold numbers and numbers already sold) over from the old store. Data eSIMs and old orders are not imported. A number sold to an account that is not carried over is kept but retired.",
          )}
        </p>
      </div>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="text-sm">
            <span className="font-medium">{t("admin.esim.migSource", "Old database")}: </span>
            {status.source ? (
              <span className="font-mono">{status.source}</span>
            ) : (
              <span className="text-amber-700 dark:text-amber-400">
                {t("admin.esim.migNoSource", "Not configured — set LEGACY_MYSQL_HOST, LEGACY_MYSQL_DATABASE, LEGACY_MYSQL_USER and LEGACY_MYSQL_PASSWORD in .env and restart.")}
              </span>
            )}
          </div>
          <div>
            <div className="mb-1 text-sm font-medium">{t("admin.esim.migImported", "Imported so far")}</div>
            <Counts values={status.imported} />
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy || status.running || !status.source} onClick={() => void start(false)}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SearchCheck className="mr-2 h-4 w-4" />}
                {t("admin.esim.migCheckButton", "Check (changes nothing)")}
              </Button>
              <Button disabled={busy || status.running || !status.source} onClick={() => void start(true)}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DatabaseZap className="mr-2 h-4 w-4" />}
                {t("admin.esim.migImportButton", "Import")}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <div className="space-y-3">
        {status.runs.map((run) => (
          <RunCard key={run.id} run={run} />
        ))}
      </div>
    </div>
  );
}
