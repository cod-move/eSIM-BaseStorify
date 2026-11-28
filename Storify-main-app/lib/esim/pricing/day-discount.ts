/**
 * Multi-day discounts on day-priced plans and top-ups (eSIM Access "Get
 * DayPass Discount Rules"): the longer the stay, the smaller the share of the
 * per-day price paid. A tier pays `payBp` ten-thousandths of the full price
 * (9600 = 96%, i.e. 4% off) for `minDays`–`maxDays` days.
 *
 * The supplier's discount is passed on to the shopper: the store's per-day
 * price times the days, times the same share. Integer money only.
 */

export interface DayDiscount {
  minDays: number;
  maxDays: number;
  /** The share paid, in ten-thousandths: 1–10000. */
  payBp: number;
}

const FULL = 10_000;

/** Well-formed tiers, sorted by days; a broken one is dropped (no discount there). */
export function cleanDayDiscounts(tiers: ReadonlyArray<Partial<DayDiscount>> | null | undefined): DayDiscount[] {
  return (tiers ?? [])
    .filter(
      (tier): tier is DayDiscount =>
        Number.isInteger(tier.minDays) &&
        Number.isInteger(tier.maxDays) &&
        Number.isInteger(tier.payBp) &&
        tier.minDays! >= 1 &&
        tier.maxDays! >= tier.minDays! &&
        tier.payBp! > 0 &&
        tier.payBp! <= FULL,
    )
    .map(({ minDays, maxDays, payBp }) => ({ minDays, maxDays, payBp }))
    .sort((a, b) => a.minDays - b.minDays);
}

/** The share paid for that many days (10000 when no tier covers them). */
export function dayPayBp(tiers: ReadonlyArray<DayDiscount> | null | undefined, days: number): number {
  return tiers?.find((tier) => days >= tier.minDays && days <= tier.maxDays)?.payBp ?? FULL;
}

/** `perDayMinor` × `days`, less the tier's discount, rounded to the minor unit. */
export function daysPriceMinor(perDayMinor: number, days: number, tiers?: ReadonlyArray<DayDiscount> | null): number {
  const full = perDayMinor * days;
  const bp = dayPayBp(tiers, days);
  return bp === FULL ? full : Math.round((full * bp) / FULL);
}

/** The whole-percent saving of a tier, as shown to the shopper (9600 → 4). */
export function percentOff(payBp: number): number {
  return Math.round((FULL - payBp) / 100);
}

/** The tiers worth telling the shopper about (some saving) within the days they can pick. */
export function shownDiscounts(tiers: ReadonlyArray<DayDiscount> | null | undefined, minDays: number, maxDays: number): DayDiscount[] {
  return (tiers ?? [])
    .filter((tier) => tier.payBp < FULL && tier.maxDays >= minDays && tier.minDays <= maxDays)
    .map((tier) => ({ ...tier, minDays: Math.max(tier.minDays, minDays), maxDays: Math.min(tier.maxDays, maxDays) }));
}

/** The tiers as the app API sends them (`discounts`, whole percent off), left out when none saves anything. */
export function discountTiers(
  tiers: ReadonlyArray<DayDiscount> | null | undefined,
  minDays: number,
  maxDays: number,
): { discounts?: Array<{ minDays: number; maxDays: number; percentOff: number }> } {
  const shown = shownDiscounts(tiers, minDays, maxDays)
    .map((tier) => ({ minDays: tier.minDays, maxDays: tier.maxDays, percentOff: percentOff(tier.payBp) }))
    .filter((tier) => tier.percentOff > 0);
  return shown.length ? { discounts: shown } : {};
}
