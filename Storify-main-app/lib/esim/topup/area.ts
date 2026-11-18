import type { ProviderTopupPlan } from "@/lib/esim/providers/types";

/**
 * Whether a top-up renews the eSIM's own plan (the same area again) rather
 * than buying a plan for another area: by the supplier's id for it against
 * the plan's `sku` or its own id (BNESIM: the same product again) where known, else by exactly the same countries,
 * else by a region name equal to the plan's destination. One that does not
 * say where it works counts as a renewal.
 */
export function renewsOwnPlan(
  area: ProviderTopupPlan["area"],
  plan: { sku?: string | null; providerPlanId?: string | null; countries: string[]; destination?: string | null },
): boolean {
  if (!area) return true;
  if (area.key && (plan.sku || plan.providerPlanId)) return area.key === plan.sku || area.key === plan.providerPlanId;
  if (area.countryCodes.length && plan.countries.length) {
    const own = new Set(plan.countries);
    return area.countryCodes.length === own.size && area.countryCodes.every((code) => own.has(code));
  }
  if (!area.name || !plan.destination) return true;
  return area.name.trim().toLowerCase() === plan.destination.trim().toLowerCase();
}
