import { topupPlanIdForDays, type ProviderTopupPlan } from "@/lib/esim/providers/types";

/** A top-up the shopper cannot take as asked; its message is shown to them. */
export class TopupError extends Error {}

/**
 * A listed top-up as it is taken: a day pass (`perDay`) for the chosen days,
 * within its range — its default days when none is given — as the supplier's
 * id for those days, at its cost per day times them; anything else as listed.
 */
export function forDays(plan: ProviderTopupPlan, days?: number | null): ProviderTopupPlan {
  if (!plan.perDay) return plan;
  const chosen = days ?? plan.perDay.defaultDays;
  if (!Number.isInteger(chosen) || chosen < plan.perDay.minDays || chosen > plan.perDay.maxDays) {
    throw new TopupError(`Choose between ${plan.perDay.minDays} and ${plan.perDay.maxDays} days`);
  }
  return {
    ...plan,
    topupPlanId: topupPlanIdForDays(plan.topupPlanId, chosen),
    name: `${plan.name} × ${chosen} ${chosen === 1 ? "day" : "days"}`,
    validityDays: chosen,
    cost: { ...plan.cost, amountMinor: plan.cost.amountMinor * chosen },
    perDay: null,
  };
}
