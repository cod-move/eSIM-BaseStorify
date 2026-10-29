import "server-only";

import * as z from "zod";
import { connectDB } from "@/lib/db";
import { getEsimSettings } from "@/models/esim-pricing.model";

/** Order review settings (ORD-13): when a paid order waits for a person. Shown on Admin → eSIM → Pricing. */

export const RiskSettingsSchema = z.object({
  reviewOverMinor: z.number().int().min(0).max(100_000_000),
  maxOrders: z.number().int().min(0).max(1000),
  windowHours: z.number().int().min(1).max(720),
});

export type RiskSettingsInput = z.infer<typeof RiskSettingsSchema>;

export async function getRiskSettings(): Promise<RiskSettingsInput> {
  await connectDB();
  const stored = (await getEsimSettings()).risk;
  return {
    reviewOverMinor: stored?.reviewOverMinor ?? 0,
    maxOrders: stored?.maxOrders ?? 0,
    windowHours: stored?.windowHours ?? 24,
  };
}

export async function saveRiskSettings(next: RiskSettingsInput) {
  const before = await getRiskSettings();
  const settings = await getEsimSettings();
  settings.risk = { ...next };
  await settings.save();
  return { before, after: next };
}
