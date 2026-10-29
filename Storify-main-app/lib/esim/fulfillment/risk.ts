/**
 * Whether a paid order's eSIMs wait for a person before anything is bought
 * (ORD-13). Pure. Holding instead of refusing at checkout costs no honest
 * sale, and stops a stolen card from spending the supplier balance.
 */

export interface RiskSettings {
  /** Hold orders of at least this much, in cents; 0 = never. */
  reviewOverMinor: number;
  /** Hold a buyer's order once they already paid for this many eSIM orders in the window; 0 = never. */
  maxOrders: number;
  windowHours: number;
}

/** The reasons to hold the order, as admins read them; empty to buy at once. */
export function reviewReasons(
  input: { totalMinor: number; recentOrders: number },
  settings: RiskSettings | null | undefined,
): string[] {
  if (!settings) return [];
  const reasons: string[] = [];
  if (settings.reviewOverMinor > 0 && input.totalMinor >= settings.reviewOverMinor) {
    reasons.push(`Order of ${(input.totalMinor / 100).toFixed(2)}, at or over the review amount of ${(settings.reviewOverMinor / 100).toFixed(2)}`);
  }
  if (settings.maxOrders > 0 && input.recentOrders >= settings.maxOrders) {
    reasons.push(`The buyer already paid for ${input.recentOrders} eSIM order(s) in the last ${settings.windowHours} hour(s)`);
  }
  return reasons;
}
