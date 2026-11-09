import "server-only";

import * as z from "zod";
import { connectDB } from "@/lib/db";
import { getEsimSettings, type IEsimSettings } from "@/models/esim-pricing.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { RECHARGE_DEFAULT_MIN_MINOR, RECHARGE_FLOOR_MINOR, RECHARGE_MAX_MINOR } from "@/lib/esim/numbers/line";

/**
 * Number-card settings (NUM-04/08), set under Admin → eSIM → Numbers: the
 * smallest recharge, in cents of TopConnect's currency. It holds for the
 * first recharge (always bought with a number) and for later ones. And
 * whether a shopper may ask for a new QR code, and its fee off the card's
 * credit.
 */

/** The new-QR-code fee when none is set (as other number shops ask). */
export const QR_FEE_DEFAULT_MINOR = 150;
export const QR_FEE_MAX_MINOR = 5000;

export const NumberSettingsSchema = z.object({
  rechargeMinMinor: z
    .number()
    .int()
    .min(RECHARGE_FLOOR_MINOR)
    .max(RECHARGE_MAX_MINOR)
    .refine((value) => value % 100 === 0, "Use a whole amount"),
  qrEnabled: z.boolean(),
  qrFeeMinor: z.number().int().min(0).max(QR_FEE_MAX_MINOR),
});

export type NumberSettingsInput = z.infer<typeof NumberSettingsSchema>;

/** The smallest recharge; pass the settings when they are already loaded. */
export function rechargeMinOf(settings: Pick<IEsimSettings, "numbers">): number {
  const stored = settings.numbers?.rechargeMinMinor;
  return typeof stored === "number" && stored >= RECHARGE_FLOOR_MINOR && stored <= RECHARGE_MAX_MINOR ? stored : RECHARGE_DEFAULT_MIN_MINOR;
}

export async function getNumberSettings(): Promise<NumberSettingsInput> {
  await connectDB();
  const settings = await getEsimSettings();
  const fee = settings.numbers?.qrFeeMinor;
  return {
    rechargeMinMinor: rechargeMinOf(settings),
    qrEnabled: settings.numbers?.qrEnabled !== false,
    qrFeeMinor: typeof fee === "number" && Number.isInteger(fee) && fee >= 0 && fee <= QR_FEE_MAX_MINOR ? fee : QR_FEE_DEFAULT_MINOR,
  };
}

/** The settings with the currency recharges are put on the card in, for the admin page. */
export async function getNumberSettingsView(): Promise<NumberSettingsInput & { currency: string }> {
  const [settings, provider] = await Promise.all([
    getNumberSettings(),
    EsimProvider.findOne({ code: "topconnect" }).select({ settlementCurrency: 1 }).lean(),
  ]);
  return { ...settings, currency: provider?.settlementCurrency ?? "EUR" };
}

export async function saveNumberSettings(next: NumberSettingsInput) {
  const before = await getNumberSettings();
  const settings = await getEsimSettings();
  settings.set("numbers.rechargeMinMinor", next.rechargeMinMinor);
  settings.set("numbers.qrEnabled", next.qrEnabled);
  settings.set("numbers.qrFeeMinor", next.qrFeeMinor);
  await settings.save();
  return { before, after: next };
}
