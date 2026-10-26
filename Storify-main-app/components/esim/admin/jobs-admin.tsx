"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Loader2, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast-notification";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import type { AdminJob } from "@/lib/esim/admin/jobs";

/** The eSIM scheduled jobs and whether they keep their schedule (ADM-10). */
export function EsimJobsAdmin({ jobs, canManage }: { jobs: AdminJob[]; canManage: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const describe: Record<string, string> = {
    "esim-fulfillment": t("admin.esim.jobFulfilment", "Retries, supplier polls and paid orders never queued. Every minute."),
    "esim-catalog": t("admin.esim.jobCatalog", "Syncs every active supplier's plans. Every 6 hours."),
    "esim-fx": t("admin.esim.jobFx", "Loads the day's exchange rates and re-prices plans whose currency moved. Daily."),
    "esim-usage": t("admin.esim.jobUsage", "Checks live eSIMs' usage with their suppliers and sends shopper reminders. Every 30 minutes."),
  };

  async function run(job: string) {
    setBusy(job);
    try {
      await apiClient.post(`/api/esim/admin/cron/${job}`, {});
      toast.success(t("admin.esim.jobStarted", "Started. Refresh in a moment to see the result."));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  const anyStale = jobs.some((job) => job.stale);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("admin.sidebar.esimJobs", "Scheduled jobs")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("admin.esim.jobsHint", "They run when the scheduler calls their address with CRON_SECRET: on Vercel from vercel.json, on your own server from its cron.")}
        </p>
      </div>
      {anyStale ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t("admin.esim.jobsStale", "A job has not run on schedule. Without the fulfilment job, retries and slow suppliers are never picked up again.")}
        </div>
      ) : null}
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.esim.job", "Job")}</TableHead>
                <TableHead>{t("admin.esim.schedule", "Schedule")}</TableHead>
                <TableHead>{t("admin.esim.lastRun", "Last run")}</TableHead>
                <TableHead>{t("admin.esim.status", "Status")}</TableHead>
                {canManage ? <TableHead /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.job}>
                  <TableCell>
                    <div className="font-medium">{job.job}</div>
                    <div className="text-xs text-muted-foreground">{describe[job.job]}</div>
                    <div className="font-mono text-xs text-muted-foreground">{job.path}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{job.schedule}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : t("admin.esim.never", "Never")}</TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      {job.stale ? (
                        <Badge variant="destructive">{t("admin.esim.notRunning", "Not running")}</Badge>
                      ) : job.lastStatus === "failed" ? (
                        <Badge variant="destructive">{t("admin.esim.failed", "Failed")}</Badge>
                      ) : (
                        <span className="flex items-center gap-1 text-sm text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" /> {t("admin.esim.onSchedule", "On schedule")}
                        </span>
                      )}
                      {job.lastError ? <span className="text-xs text-destructive">{job.lastError}</span> : null}
                      {job.consecutiveFailures > 1 ? (
                        <span className="text-xs text-muted-foreground">{t("admin.esim.failuresInRow", "{count} failures in a row", { count: job.consecutiveFailures })}</span>
                      ) : null}
                    </div>
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => run(job.job)}>
                        {busy === job.job ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                        {t("admin.esim.runNow", "Run now")}
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-3 text-right">
            <Button size="sm" variant="ghost" onClick={() => router.refresh()}>
              {t("admin.esim.refreshPage", "Refresh")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
