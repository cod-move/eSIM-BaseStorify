/**
 * A destination's plan filters (APP-02), the website's rules
 * (lib/esim/storefront/plan-filter.ts) on the values the store sends: a plan
 * shows under a value when its `facets[key]` holds it; each filter offers what
 * the other chosen filters leave open; choosing a value clears any other
 * choice no plan has alongside it, so a choice never empties the list. Pure.
 */

export type PlanFilters = Record<string, string>;
type Faceted = { facets?: Record<string, string[]> };

function matches(plan: Faceted, filters: PlanFilters, except?: string): boolean {
  return Object.entries(filters).every(
    ([key, value]) => key === except || (plan.facets?.[key] ?? []).includes(value)
  );
}

/** The plans the filters leave, in the store's order. */
export function filterPlans<T extends Faceted>(plans: T[], filters: PlanFilters): T[] {
  return plans.filter((plan) => matches(plan, filters));
}

/** The values of `key` some plan has under the other chosen filters. */
export function openValues(plans: Faceted[], filters: PlanFilters, key: string): Set<string> {
  const open = new Set<string>();
  for (const plan of plans) {
    if (matches(plan, filters, key)) for (const value of plan.facets?.[key] ?? []) open.add(value);
  }
  return open;
}

/** The filters once `key` is `value` (undefined: all). */
export function chooseFilter(
  plans: Faceted[],
  filters: PlanFilters,
  key: string,
  value: string | undefined
): PlanFilters {
  const next: PlanFilters = { ...filters };
  if (value === undefined) {
    delete next[key];
    return next;
  }
  next[key] = value;
  // First what cannot go with the new value at all, then, while nothing is left, the rest in order.
  for (const other of Object.keys(next)) {
    if (other === key) continue;
    if (!plans.some((plan) => matches(plan, { [key]: value, [other]: next[other]! })))
      delete next[other];
  }
  for (const other of Object.keys(next)) {
    if (other === key) continue;
    if (!plans.some((plan) => matches(plan, next))) delete next[other];
  }
  return next;
}
