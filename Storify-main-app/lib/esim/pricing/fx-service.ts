import "server-only";

import { EsimFxRate } from "@/models/esim-fx-rate.model";
import { fetchEcbDaily, usdPerUnit } from "@/lib/esim/pricing/fx";

/**
 * Stored rates: refreshing from the ECB, setting a manual override, and
 * reading the rate pricing uses.
 */

/** Writes the ECB's latest day; a day already stored is left alone. */
export async function refreshEcbRates() {
  const rates = await fetchEcbDaily();
  const effectiveAt = new Date(`${rates.date}T00:00:00Z`);
  const perUnit = usdPerUnit(rates);
  const result = await EsimFxRate.bulkWrite(
    Object.entries(perUnit).map(([currency, value]) => ({
      updateOne: {
        filter: { currency, source: "ecb", effectiveAt },
        update: { $setOnInsert: { currency, source: "ecb", effectiveAt, usdPerUnit: value } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  return { date: rates.date, currencies: Object.keys(perUnit).length, inserted: result.upsertedCount };
}

export async function setManualRate(currency: string, usdPerUnitValue: number, actor?: string) {
  if (!(usdPerUnitValue > 0)) throw new Error("A rate must be a positive number");
  return EsimFxRate.create({
    currency: currency.toUpperCase(),
    usdPerUnit: usdPerUnitValue,
    source: "manual",
    effectiveAt: new Date(),
    createdBy: actor,
  });
}

/** Removing every manual row hands the currency back to the ECB feed. */
export async function clearManualRate(currency: string) {
  const result = await EsimFxRate.deleteMany({ currency: currency.toUpperCase(), source: "manual" });
  return result.deletedCount;
}

export interface ResolvedRate {
  currency: string;
  usdPerUnit: number;
  source: "ecb" | "manual" | "identity";
  effectiveAt: Date | null;
}

/** The rate pricing uses now: the newest manual row, else the newest ECB row. */
export async function currentRates(currencies: string[]): Promise<Map<string, ResolvedRate>> {
  const wanted = [...new Set(currencies.map((currency) => currency.toUpperCase()))];
  const resolved = new Map<string, ResolvedRate>();
  for (const currency of wanted) {
    if (currency === "USD") {
      resolved.set(currency, { currency, usdPerUnit: 1, source: "identity", effectiveAt: null });
      continue;
    }
    const row =
      (await EsimFxRate.findOne({ currency, source: "manual" }).sort({ effectiveAt: -1 }).lean()) ??
      (await EsimFxRate.findOne({ currency, source: "ecb" }).sort({ effectiveAt: -1 }).lean());
    if (row) {
      resolved.set(currency, {
        currency,
        usdPerUnit: row.usdPerUnit,
        source: row.source,
        effectiveAt: row.effectiveAt,
      });
    }
  }
  return resolved;
}
