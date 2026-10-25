import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { withCronRun } from "@/lib/cron/health";
import { syncAllCatalogs } from "@/lib/esim/catalog/sync";

/**
 * eSIM catalogue sync (CAT-03): every active supplier's plans into EsimPlan.
 * Schedule it every few hours; Stellar's catalogue is ~7,000 plans over
 * ~150 pages, so give the function room (maxDuration below).
 *
 * Guarded by CRON_SECRET through withCronRun, like every other cron here.
 */
export const maxDuration = 300;

export const GET = withCronRun(
  "esim-catalog",
  async () => {
    await connectDB();
    const results = await syncAllCatalogs();
    return NextResponse.json({ success: true, data: results });
  },
  {
    outcome: async (response) => {
      const body = (await response.clone().json()) as {
        data?: Array<{ provider: string; status: string; error?: string }>;
      };
      const failed = (body.data ?? []).filter((result) => result.status === "failed");
      return failed.length
        ? {
            status: "failed",
            complete: false,
            error: failed.map((result) => `${result.provider}: ${result.error}`).join("; "),
          }
        : { status: "ok", complete: true };
    },
  },
);
