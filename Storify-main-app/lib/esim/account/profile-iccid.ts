import { obj } from "@/lib/esim/providers/json";
import { stellarIccid } from "@/lib/esim/providers/stellar";

/**
 * Where a Stellar eSIM's own answers sit in a profile's `raw`:
 *
 *   - issued here: `raw` is the eSIM read itself;
 *   - migrated from the old store: `raw` is `{ legacyId }`;
 *   - after a refresh (lib/esim/account/esims.ts) either gains
 *     `latest: { esim, usage }`, or — when `raw` was not an object —
 *     becomes `{ order: <old raw>, latest }`.
 *
 * The ICCID is read from each of them; one value is returned only when they
 * all agree, so a stray or conflicting one is never written to the profile.
 */
export type RawIccid =
  | { iccid: string; conflict: false }
  | { iccid: null; conflict: boolean };

export function iccidFromStellarRaw(raw: unknown): RawIccid {
  const root = obj(raw);
  const latest = obj(root.latest);
  const order = obj(root.order);
  const nodes = [root, obj(latest.esim), obj(latest.usage), order, obj(obj(order.latest).esim)];
  const found = new Set<string>();
  for (const node of nodes) {
    const iccid = stellarIccid(node);
    if (iccid) found.add(iccid);
  }
  if (found.size === 1) return { iccid: [...found][0], conflict: false };
  return { iccid: null, conflict: found.size > 1 };
}

export interface BackfillCandidate {
  id: string;
  iccid: string;
}

export interface BackfillPlan {
  /** Safe to write: the ICCID is on no other profile and no other candidate. */
  apply: BackfillCandidate[];
  /** The ICCID is already another profile's. */
  taken: Array<BackfillCandidate & { holder: string }>;
  /** Two or more candidates read the same ICCID: none of them is written. */
  shared: BackfillCandidate[];
}

/**
 * Which candidates may take their ICCID. `holders` maps an ICCID already on a
 * profile to that profile's id.
 */
export function planIccidBackfill(candidates: BackfillCandidate[], holders: Map<string, string>): BackfillPlan {
  const counts = new Map<string, number>();
  for (const candidate of candidates) counts.set(candidate.iccid, (counts.get(candidate.iccid) ?? 0) + 1);
  const plan: BackfillPlan = { apply: [], taken: [], shared: [] };
  for (const candidate of candidates) {
    const holder = holders.get(candidate.iccid);
    if (holder && holder !== candidate.id) plan.taken.push({ ...candidate, holder });
    else if ((counts.get(candidate.iccid) ?? 0) > 1) plan.shared.push(candidate);
    else plan.apply.push(candidate);
  }
  return plan;
}
