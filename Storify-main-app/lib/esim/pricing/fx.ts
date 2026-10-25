import type { FetchLike } from "@/lib/esim/providers/http";

/**
 * Exchange rates from the European Central Bank's daily reference feed: free,
 * keyless and published every working day around 16:00 CET. The feed is
 * EUR-based; the store needs USD-based, so every rate is crossed through USD.
 */

export const ECB_DAILY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

export interface EcbRates {
  /** The day the ECB published these for (YYYY-MM-DD). */
  date: string;
  /** Units of each currency per 1 EUR, EUR itself included as 1. */
  perEur: Record<string, number>;
}

export function parseEcbDaily(xml: string): EcbRates {
  const date = xml.match(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
  if (!date) throw new Error("ECB feed has no publication date");
  const perEur: Record<string, number> = { EUR: 1 };
  for (const match of xml.matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]/g)) {
    const rate = Number(match[2]);
    if (Number.isFinite(rate) && rate > 0) perEur[match[1]] = rate;
  }
  if (!perEur.USD) throw new Error("ECB feed has no USD rate");
  return { date, perEur };
}

/** 1 unit of each currency in USD: (USD per EUR) / (currency per EUR). */
export function usdPerUnit(rates: EcbRates): Record<string, number> {
  const usdPerEur = rates.perEur.USD;
  return Object.fromEntries(
    Object.entries(rates.perEur).map(([currency, perEur]) => [currency, usdPerEur / perEur]),
  );
}

export async function fetchEcbDaily(fetcher: FetchLike = fetch): Promise<EcbRates> {
  const response = await fetcher(ECB_DAILY_URL, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`ECB feed answered HTTP ${response.status}`);
  return parseEcbDaily(await response.text());
}
