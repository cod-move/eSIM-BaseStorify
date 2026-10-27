import "server-only";

import { connectDB } from "@/lib/db";
import { CronRun } from "@/models/cron-run.model";
import { syncAllCatalogs } from "@/lib/esim/catalog/sync";
import { runFulfilmentCron } from "@/lib/esim/fulfillment";
import { refreshFx } from "@/lib/esim/admin/pricing";
import { runUsageSync } from "@/lib/esim/usage/sync";
import { runReferralPayouts } from "@/lib/esim/referral/commission";
import { sweepPayments } from "@/lib/esim/payments/service";
import { ESIM_CRON_JOBS, type EsimCronJob } from "@/lib/esim/admin/cron-config";

/**
 * Admin → eSIM → Scheduled jobs (ADM-10): whether each eSIM job keeps its
 * schedule — read from Storify's own run records (`CronRun`, written by
 * `withCronRun`) — and running one now. A manual run records itself the same
 * way, so the page and the dashboard's health check agree.
 */

const RUNNERS: Record<EsimCronJob, () => Promise<unknown>> = {
  "esim-fulfillment": async () => ({ ...(await runFulfilmentCron()), payments: await sweepPayments() }),
  "esim-catalog": syncAllCatalogs,
  "esim-fx": refreshFx,
  "esim-usage": async () => ({ ...(await runUsageSync()), referrals: await runReferralPayouts() }),
};

export interface AdminJob {
  job: EsimCronJob;
  path: string;
  schedule: string;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  /** Not run within its allowance (or never): the scheduler is not calling it. */
  stale: boolean;
}

export async function listJobs(): Promise<AdminJob[]> {
  await connectDB();
  const rows = await CronRun.find({ job: { $in: ESIM_CRON_JOBS.map((entry) => entry.job) } }).lean();
  const byJob = new Map(rows.map((row) => [row.job, row]));
  return ESIM_CRON_JOBS.map((entry) => {
    const row = byJob.get(entry.job);
    const lastRunAt = row?.lastRunAt ? new Date(row.lastRunAt) : null;
    return {
      job: entry.job,
      path: entry.path,
      schedule: entry.schedule,
      lastRunAt: lastRunAt?.toISOString() ?? null,
      lastStatus: row?.lastStatus ?? null,
      lastError: row?.lastError ?? null,
      consecutiveFailures: row?.consecutiveFailures ?? 0,
      stale: !lastRunAt || Date.now() - lastRunAt.getTime() > entry.staleAfterMs,
    };
  });
}

export function isEsimJob(job: string): job is EsimCronJob {
  return job in RUNNERS;
}

/** Runs the job and records the run as the scheduled one would. Never throws. */
export async function runJobNow(job: EsimCronJob): Promise<{ ok: boolean; error?: string }> {
  await connectDB();
  try {
    await RUNNERS[job]();
    await CronRun.updateOne(
      { job },
      { $set: { lastRunAt: new Date(), lastStatus: "ok", consecutiveFailures: 0 }, $unset: { lastError: "" } },
      { upsert: true },
    );
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await CronRun.updateOne(
      { job },
      { $set: { lastRunAt: new Date(), lastStatus: "failed", lastError: message.slice(0, 500) }, $inc: { consecutiveFailures: 1 } },
      { upsert: true },
    ).catch(() => undefined);
    return { ok: false, error: message };
  }
}
