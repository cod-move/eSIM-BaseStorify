import "server-only";

import { getEsimSettings } from "@/models/esim-pricing.model";
import { DEFAULT_UNLIMITED_MIN_KBPS } from "@/lib/esim/catalog/data-kind";

/** The slowed speed (kbps) from which a day-pass is shown as unlimited (lib/esim/catalog/data-kind.ts). */
export async function unlimitedMinKbps(): Promise<number> {
  const settings = await getEsimSettings();
  const value = settings.unlimitedMinSpeedKbps;
  return typeof value === "number" && value >= 0 ? value : DEFAULT_UNLIMITED_MIN_KBPS;
}
