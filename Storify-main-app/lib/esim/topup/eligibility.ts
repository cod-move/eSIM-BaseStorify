import type { FulfillmentStatus, LifecycleStatus, TopupRule } from "@/lib/esim/providers/types";

/**
 * Whether an eSIM can be topped up now (TOP-01). Pure.
 *
 * - The plan must take top-ups and its supplier must sell them.
 * - before_expiry (or no window stated): only while the current package
 *   lives — not expired, not used up, not cancelled; after that the eSIM is
 *   void and a new one has to be bought.
 * - while_profile_exists: any time until the supplier reclaims the profile.
 */

export type TopupRefusal =
  | "not_supported"
  | "not_issued"
  | "cancelled"
  | "expired"
  | "used_up"
  | "profile_expired";

export interface EligibilityInput {
  rule: Pick<TopupRule, "supported" | "mode" | "window">;
  supplierSellsTopups: boolean;
  status: FulfillmentStatus;
  lifecycle: LifecycleStatus | null;
  expiresAt: Date | null;
  topupDeadline: Date | null;
  profileExpiresAt: Date | null;
}

export type Eligibility = { ok: true } | { ok: false; reason: TopupRefusal };

/** English fallbacks; pages translate by `reason` (esim.topup.refusal.*). */
export const REFUSAL_TEXT: Record<TopupRefusal, string> = {
  not_supported: "This plan cannot be topped up.",
  not_issued: "This eSIM has not been issued.",
  cancelled: "This eSIM was cancelled.",
  expired: "This plan has expired and can no longer be topped up. Buy a new eSIM instead.",
  used_up: "This plan's data is used up and it can no longer be topped up. Buy a new eSIM instead.",
  profile_expired: "This eSIM is no longer valid. Buy a new eSIM instead.",
};

export function topupEligibility(input: EligibilityInput, now: Date = new Date()): Eligibility {
  const refuse = (reason: TopupRefusal): Eligibility => ({ ok: false, reason });
  if (!input.rule.supported || input.rule.mode === "none" || !input.supplierSellsTopups) return refuse("not_supported");
  if (input.status !== "fulfilled") return refuse("not_issued");
  if (input.lifecycle === "cancelled") return refuse("cancelled");

  if (input.rule.window === "while_profile_exists") {
    if (input.profileExpiresAt && input.profileExpiresAt <= now) return refuse("profile_expired");
    return { ok: true };
  }
  const deadline = input.topupDeadline ?? input.expiresAt;
  if (input.lifecycle === "expired" || (deadline && deadline <= now)) return refuse("expired");
  if (input.lifecycle === "depleted") return refuse("used_up");
  return { ok: true };
}
