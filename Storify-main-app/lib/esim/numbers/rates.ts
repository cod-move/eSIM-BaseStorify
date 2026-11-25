/**
 * What a phone number eSIM costs to use, pay as you go (NUM-03): TopConnect's
 * retail rates by the country the shopper is in, taken from the card's
 * credit. The rates themselves are generated into rates-data.ts; this file
 * reads them. Pure, so the page, the browser and the tests share it.
 * Amounts are in euro cents, the card's currency.
 */

import { continentOf, type Continent } from "@/lib/esim/storefront/continents";

export interface NumberRateCountry {
  /** ISO 3166 code, or null for a place that is not one country ("Netherlands Antilles"). */
  code: string | null;
  /** TopConnect's English name. */
  name: string;
  /** Per minute. travelSim: to another TravelSim and to voicemail. */
  voice?: { incoming: number; outgoing: number; travelSim: number };
  /** Per text. eu: to EU numbers; travelSim: to another TravelSim. */
  sms?: { any: number; eu?: number; travelSim?: number };
  /** Per MB on each network, cheapest first, billed in steps of stepKb. */
  data?: Array<{ network: string; perMb: number; stepKb: number }>;
}

export interface NumberRateSurcharge {
  code: string | null;
  name: string;
  /** null: the whole country; "satellite"; or a part of it ("mobile", "rural", "easter_island", "external_territories"). */
  part: string | null;
  /** Added per minute to an outgoing call there. */
  add: number;
}

export type RateKind = "call" | "sms" | "data";
export type RateTier = "free" | "low" | "mid" | "high";

/** Where a rate sits, for colour: upper bounds (cents) of "low" and "mid" for each kind. */
const TIERS: Record<RateKind, [low: number, mid: number]> = {
  call: [39, 75],
  sms: [19, 49],
  data: [4, 22],
};

export function rateTier(kind: RateKind, cents: number): RateTier {
  if (cents <= 0) return "free";
  const [low, mid] = TIERS[kind];
  return cents <= low ? "low" : cents <= mid ? "mid" : "high";
}

/** The cheapest network in a country, or null without data. */
export function cheapestData(country: NumberRateCountry) {
  return country.data?.length ? country.data.reduce((best, net) => (net.perMb < best.perMb ? net : best)) : null;
}

/** A GB at a per-MB rate, in cents (1 GB = 1024 MB). */
export const perGb = (perMb: number) => perMb * 1024;

/**
 * An outgoing call per minute while in `stay`, to a destination that may
 * carry a surcharge. null when calls are not listed for that country.
 */
export function outgoingCall(stay: NumberRateCountry, surcharge?: NumberRateSurcharge | null): number | null {
  if (!stay.voice) return null;
  return stay.voice.outgoing + (surcharge?.add ?? 0);
}

export const rateContinent = (country: NumberRateCountry): Continent => continentOf(country.code);

/** A key for a country that stays the same across languages and regenerations. */
export const rateKey = (country: Pick<NumberRateCountry, "code" | "name">) => country.code ?? country.name;
