import "server-only";

import { notifyAdminsPaymentAnomaly } from "@/lib/notifications/notifications";

/**
 * Admin alerts about a supplier (NTF-09): its catalogue sync failed, its
 * usage checks keep failing, or it refused an order in a way that reads like
 * an empty balance. Through Storify's admin alert (in-app, push, email), at
 * most once per supplier, kind and day.
 */

export type SupplierProblem = "catalog" | "usage" | "balance";

const TITLES: Record<SupplierProblem, string> = {
  catalog: "eSIM supplier catalogue sync failed",
  usage: "eSIM supplier usage checks failing",
  balance: "eSIM supplier may be out of balance",
};

export { looksLikeBalanceProblem } from "@/lib/esim/alerts-words";

/**
 * A supplier charged more for an eSIM than the plan's catalogue cost said:
 * the plan's price was set from a cost that no longer holds (a rise not yet
 * synced, or a fee on top). Once per plan and day.
 */
export async function alertSupplierOvercharge(input: {
  providerCode: string;
  providerPlanId: string;
  planName: string;
  currency: string;
  listMinor: number;
  chargedMinor: number;
}) {
  const day = new Date().toISOString().slice(0, 10);
  const money = (minor: number) => `${(minor / 100).toFixed(2)} ${input.currency}`;
  const percent = Math.round(((input.chargedMinor - input.listMinor) / input.listMinor) * 100);
  await notifyAdminsPaymentAnomaly({
    title: "eSIM supplier charged above the plan's cost",
    message: `${input.providerCode}: ${input.planName} charged ${money(input.chargedMinor)}, catalogue cost ${money(input.listMinor)} (+${percent}%). Check the plan's price.`.slice(0, 480),
    dedupeKey: `esim-supplier:overcharge:${input.providerCode}:${input.providerPlanId}:${day}`,
    link: "/admin/esim/plans",
  }).catch((error) => console.error("eSIM supplier alert failed:", error));
}

export async function alertSupplierProblem(providerCode: string, problem: SupplierProblem, detail: string) {
  const day = new Date().toISOString().slice(0, 10);
  await notifyAdminsPaymentAnomaly({
    title: TITLES[problem],
    message: `${providerCode}: ${detail}`.slice(0, 480),
    dedupeKey: `esim-supplier:${problem}:${providerCode}:${day}`,
    link: problem === "catalog" ? "/admin/esim/jobs" : "/admin/esim/providers",
  }).catch((error) => console.error("eSIM supplier alert failed:", error));
}
