import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { withCronRun } from "@/lib/cron/health";
import { refreshFx } from "@/lib/esim/admin/pricing";

/**
 * eSIM exchange rates (CAT-08): today's ECB rates, then re-pricing of the
 * plans whose currency moved past the threshold. Daily, after the ECB
 * publishes (about 16:00 CET on working days). Guarded by CRON_SECRET
 * through withCronRun, like every other cron here.
 */
export const maxDuration = 120;

export const GET = withCronRun("esim-fx", async () => {
  await connectDB();
  return NextResponse.json({ success: true, data: await refreshFx() });
});
