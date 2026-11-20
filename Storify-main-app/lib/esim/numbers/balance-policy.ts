/**
 * Which balance notice a number's credit calls for. Pure, tested.
 * At or under 0.02 (2 cents of the card currency) the line runs low; at or
 * under 0 it is cut off until recharged. An unknown balance sends nothing.
 */

export type BalanceAlert = "low" | "empty";

export const LOW_BALANCE_MINOR = 2;

export function balanceAlertOf(balanceMinor: number | null | undefined): BalanceAlert | null {
  if (typeof balanceMinor !== "number" || !Number.isFinite(balanceMinor)) return null;
  if (balanceMinor <= 0) return "empty";
  if (balanceMinor <= LOW_BALANCE_MINOR) return "low";
  return null;
}

/** "2026-11-20": the UTC day a notice counts against, so each kind goes out once a day. */
export const alertDay = (now: Date): string => now.toISOString().slice(0, 10);
