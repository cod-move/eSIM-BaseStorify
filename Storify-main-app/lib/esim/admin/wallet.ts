import "server-only";

import * as z from "zod";
import { connectDB } from "@/lib/db";
import { getEsimSettings } from "@/models/esim-pricing.model";

/** Wallet top-up settings (WAL-01): on/off, the amounts allowed and the fee. Shown on Admin → eSIM → Pricing. */

export const WalletSettingsSchema = z
  .object({
    enabled: z.boolean(),
    minMinor: z.number().int().min(100).max(100_000_000),
    maxMinor: z.number().int().min(100).max(100_000_000),
    feeFixedMinor: z.number().int().min(0).max(100_000),
    feePercent: z.number().min(0).max(50),
  })
  .refine((value) => value.maxMinor >= value.minMinor, { message: "The largest amount must be at least the smallest", path: ["maxMinor"] });

export type WalletSettings = z.infer<typeof WalletSettingsSchema>;

export async function getWalletSettings(): Promise<WalletSettings> {
  await connectDB();
  const stored = (await getEsimSettings()).wallet;
  return {
    enabled: stored?.enabled ?? true,
    minMinor: stored?.minMinor ?? 500,
    maxMinor: stored?.maxMinor ?? 100_000,
    feeFixedMinor: stored?.feeFixedMinor ?? 0,
    feePercent: stored?.feePercent ?? 0,
  };
}

export async function saveWalletSettings(next: WalletSettings) {
  const before = await getWalletSettings();
  const settings = await getEsimSettings();
  settings.wallet = { ...next };
  await settings.save();
  return { before, after: next };
}
