import "server-only";

import * as z from "zod";
import { connectDB } from "@/lib/db";
import { getEsimSettings } from "@/models/esim-pricing.model";
import type { ReminderSettings } from "@/lib/esim/reminders/policy";

/** The shopper reminder settings (NTF-03/04/05/07), shown and saved on the Scheduled jobs page. */

export const ReminderSettingsSchema = z.object({
  enabled: z.boolean(),
  lowDataPercent: z.number().int().min(1).max(90),
  expiringHours: z.number().int().min(1).max(336),
  installDays: z.number().int().min(1).max(60),
});

const DEFAULTS: ReminderSettings = { enabled: true, lowDataPercent: 20, expiringHours: 24, installDays: 3 };

export async function getReminderSettings(): Promise<ReminderSettings> {
  await connectDB();
  const stored = (await getEsimSettings()).reminders;
  return {
    enabled: stored?.enabled ?? DEFAULTS.enabled,
    lowDataPercent: stored?.lowDataPercent ?? DEFAULTS.lowDataPercent,
    expiringHours: stored?.expiringHours ?? DEFAULTS.expiringHours,
    installDays: stored?.installDays ?? DEFAULTS.installDays,
  };
}

export async function saveReminderSettings(next: ReminderSettings) {
  const before = await getReminderSettings();
  const settings = await getEsimSettings();
  settings.reminders = { ...next };
  await settings.save();
  return { before, after: next };
}
