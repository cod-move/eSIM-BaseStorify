import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { withCronRun } from "@/lib/cron/health";
import { runUsageSync } from "@/lib/esim/usage/sync";

/**
 * eSIM usage sync and shopper reminders (USR-04, NTF-03/04/05/07): the
 * usage and status of live eSIMs from their suppliers, then low-data,
 * plan-ending, install-by and "connected" reminders. Every 30 minutes; each
 * eSIM is asked about at most hourly. Guarded by CRON_SECRET through
 * withCronRun, like every other cron here.
 */
export const maxDuration = 60;

export const GET = withCronRun("esim-usage", async () => {
  await connectDB();
  return NextResponse.json({ success: true, data: await runUsageSync({ limit: 200, budgetMs: 50_000 }) });
});
