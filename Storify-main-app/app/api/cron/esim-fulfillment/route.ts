import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { withCronRun } from "@/lib/cron/health";
import { runFulfilmentCron } from "@/lib/esim/fulfillment";
import { sweepPayments } from "@/lib/esim/payments/service";

/**
 * eSIM fulfilment safety net (ORD-05..09). Run every minute: retries and
 * supplier polls come due here, and paid orders whose jobs were never queued
 * (a crash between payment and queueing) are picked up within two days.
 * Extension payments paid but not yet turned into an order are settled
 * again, and extension checkouts past their window are closed (PAY, P15).
 *
 * Guarded by CRON_SECRET through withCronRun, like every other cron here.
 */
export const maxDuration = 60;

export const GET = withCronRun("esim-fulfillment", async () => {
  await connectDB();
  return NextResponse.json({ success: true, data: { ...(await runFulfilmentCron()), payments: await sweepPayments() } });
});
