import "server-only";

import * as z from "zod";
import { connectDB } from "@/lib/db";
import { getEsimSettings } from "@/models/esim-pricing.model";

/** Shopper cancellation settings (USR-07): on/off, the fee kept and where the rest goes. Shown on Admin → eSIM → Pricing. */

export const CancellationSettingsSchema = z.object({
  enabled: z.boolean(),
  feeFixedMinor: z.number().int().min(0).max(100_000),
  feePercent: z.number().min(0).max(100),
  refundTo: z.enum(["balance", "original"]),
});

export type CancellationSettings = z.infer<typeof CancellationSettingsSchema>;

export async function getCancellationSettings(): Promise<CancellationSettings> {
  await connectDB();
  const stored = (await getEsimSettings()).cancellation;
  return {
    enabled: stored?.enabled ?? false,
    feeFixedMinor: stored?.feeFixedMinor ?? 0,
    feePercent: stored?.feePercent ?? 0,
    refundTo: stored?.refundTo ?? "balance",
  };
}

export async function saveCancellationSettings(next: CancellationSettings) {
  const before = await getCancellationSettings();
  const settings = await getEsimSettings();
  settings.cancellation = { ...next };
  await settings.save();
  return { before, after: next };
}
