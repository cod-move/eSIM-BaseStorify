/**
 * What an admin may add to or take off a number card's credit (Admin → eSIM
 * → Numbers → Card credit). Pure; amounts are cents of the card's currency.
 */

export type AdjustDirection = "add" | "deduct";

/** The most an admin moves in one go: 1,000.00 of the card's currency. */
export const MAX_CARD_ADJUSTMENT_MINOR = 100_000;

/**
 * Why the adjustment cannot be made; null when it can. `balanceMinor` is
 * the card's balance as TopConnect reported it just now (null: unknown).
 * A deduction never takes the card below zero.
 */
export function cardAdjustmentProblem(input: {
  direction: AdjustDirection;
  amountMinor: number;
  balanceMinor: number | null | undefined;
  blocked?: boolean | null;
}): string | null {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 1) return "Enter an amount of at least 0.01";
  if (input.amountMinor > MAX_CARD_ADJUSTMENT_MINOR) return "The amount is too large";
  if (input.blocked) return "The card is blocked";
  if (input.direction === "deduct") {
    if (typeof input.balanceMinor !== "number") return "The card's balance could not be read; refresh and try again";
    if (input.amountMinor > input.balanceMinor) return "The amount is more than the card's balance";
  }
  return null;
}

/** The signed amount TopConnect's transfer takes: positive onto the card, negative off it. */
export function signedTransferMinor(direction: AdjustDirection, amountMinor: number): number {
  return direction === "deduct" ? -amountMinor : amountMinor;
}
