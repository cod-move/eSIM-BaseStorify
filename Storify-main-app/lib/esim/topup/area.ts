import type { ProviderTopupPlan } from "@/lib/esim/providers/types";

/**
 * Whether a top-up is for the eSIM's own area: by its countries, all within
 * the plan's. One that does not say where it works counts as the own area.
 */
export function inOwnArea(area: ProviderTopupPlan["area"], planCountries: string[]): boolean {
  if (!area || !area.countryCodes.length || !planCountries.length) return true;
  const own = new Set(planCountries);
  return area.countryCodes.every((code) => own.has(code));
}
