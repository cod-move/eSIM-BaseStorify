/**
 * Taking money off a shopper's balance by hand (Admin → Customers → Store
 * credit → Deduct). Pure: amounts are whole minor units (cents), never
 * floating point. Storify keeps lots in major units, so a lot's rest is read
 * as cents first (`toMinor`), and the plan is made in cents.
 *
 * As a checkout does, the deduction takes from the lot that expires first;
 * lots that never expire come last, then the oldest.
 */

/** The largest amount an admin may take in one go: $1,000,000. */
export const MAX_DEDUCTION_MINOR = 100_000_000;

/** Why an amount (in cents) cannot be deducted from `balanceMinor`; null when it can. */
export function deductionProblem(amountMinor: number, balanceMinor: number): string | null {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 1) return "Enter an amount of at least 0.01";
  if (amountMinor > MAX_DEDUCTION_MINOR) return "The amount is too large";
  if (!Number.isSafeInteger(balanceMinor) || balanceMinor < 1) return "The customer has no balance to deduct";
  if (amountMinor > balanceMinor) return "The amount is more than the customer's balance";
  return null;
}

/** A major-unit amount as Storify stores it (12.34) → cents, rounded to the nearest. */
export function toMinor(major: number, exponent = 2): number {
  const value = Number(major);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10 ** exponent);
}

/** Cents → the major-unit amount Storify stores; exact for any whole number of cents. */
export function toMajor(minor: number, exponent = 2): number {
  return Number((minor / 10 ** exponent).toFixed(exponent));
}

/** "12.5" or "12.50" → 1250; null when it is not a positive amount with at most two decimals. */
export function parseMinor(value: string): number | null {
  const match = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return minor > 0 && Number.isSafeInteger(minor) ? minor : null;
}

export interface DeductibleLot<Id = unknown> {
  id: Id;
  remainingMinor: number;
  expiresAt?: Date | string | null;
  createdAt: Date | string;
}

/** The soonest to expire first; lots that never expire last; then the oldest. */
export function deductionOrder<T extends DeductibleLot>(lots: readonly T[]): T[] {
  const expiry = (lot: DeductibleLot) => (lot.expiresAt ? new Date(lot.expiresAt).getTime() : Number.POSITIVE_INFINITY);
  return [...lots].sort((a, b) => {
    const ae = expiry(a);
    const be = expiry(b);
    if (ae !== be) return ae - be;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

/**
 * How much to take from each lot to make `amountMinor`, in spend order.
 * `short` is what the lots cannot cover between them (0 when they can):
 * a plan with `short > 0` must not be carried out.
 */
export function planDeduction<Id>(
  lots: ReadonlyArray<DeductibleLot<Id>>,
  amountMinor: number,
): { takes: Array<{ id: Id; amountMinor: number }>; short: number } {
  let left = Math.max(0, Math.floor(amountMinor));
  const takes: Array<{ id: Id; amountMinor: number }> = [];
  for (const lot of deductionOrder(lots)) {
    if (left <= 0) break;
    const available = Math.max(0, Math.floor(lot.remainingMinor));
    const take = Math.min(left, available);
    if (take <= 0) continue;
    takes.push({ id: lot.id, amountMinor: take });
    left -= take;
  }
  return { takes, short: left };
}
