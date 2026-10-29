/**
 * Where one eSIM or top-up of an order stands, as the order pages say it
 * (ORD-11). Pure. The shopper sees four outcomes; admins also get the job's
 * own state.
 */

export type UnitOutcome = "preparing" | "issued" | "refunded" | "refund_pending" | "cancelled";

export function esimUnitOutcome(input: {
  state: string;
  refundState?: string | null;
  profileStatus?: string | null;
  cancelled?: boolean;
}): UnitOutcome {
  if (input.state === "fulfilled") {
    return input.cancelled || input.profileStatus === "refunded" ? "cancelled" : "issued";
  }
  if (input.state === "failed") return input.refundState === "done" ? "refunded" : "refund_pending";
  // review, queued, purchasing, provider_pending: still being bought.
  return "preparing";
}

export function topupUnitOutcome(input: { state: string; refundState?: string | null }): UnitOutcome {
  if (input.state === "completed") return "issued";
  if (input.state === "failed") return input.refundState === "done" ? "refunded" : "refund_pending";
  return "preparing";
}
