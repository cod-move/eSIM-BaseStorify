/**
 * The eSIM scheduled jobs (ADM-10): their routes, the schedule they are given
 * in `vercel.json`, and how long each may go quiet before Storify's cron
 * health check (lib/cron/health.ts, patch P18) reports it as not running.
 * Pure — the health check imports it.
 */
export const ESIM_CRON_JOBS = [
  { job: "esim-fulfillment", path: "/api/cron/esim-fulfillment", schedule: "* * * * *", staleAfterMs: 15 * 60 * 1000 },
  { job: "esim-catalog", path: "/api/cron/esim-catalog", schedule: "0 */6 * * *", staleAfterMs: 18 * 60 * 60 * 1000 },
  { job: "esim-fx", path: "/api/cron/esim-fx", schedule: "30 15 * * *", staleAfterMs: 36 * 60 * 60 * 1000 },
  { job: "esim-usage", path: "/api/cron/esim-usage", schedule: "*/30 * * * *", staleAfterMs: 3 * 60 * 60 * 1000 },
] as const;

export type EsimCronJob = (typeof ESIM_CRON_JOBS)[number]["job"];

export const ESIM_CRON_STALE_AFTER_MS: Record<string, number> = Object.fromEntries(
  ESIM_CRON_JOBS.map((entry) => [entry.job, entry.staleAfterMs]),
);
