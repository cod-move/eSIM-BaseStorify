import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { withCronRun } from "@/lib/cron/health";
import { runNumberBalanceAlerts } from "@/lib/esim/numbers/balance-alerts";

/**
 * Number eSIM credit check: low-balance (≤ 0.02) and out-of-credit (≤ 0)
 * notices to the owners, each kind once a day; every sold number in one run
 * (8 card_stat calls at once). Daily at 04:00 UTC (12:00
 * Singapore time). Guarded by CRON_SECRET through withCronRun.
 */
export const maxDuration = 900;

export const GET = withCronRun("esim-number-balance", async () => {
  await connectDB();
  return NextResponse.json({ success: true, data: await runNumberBalanceAlerts() });
});
