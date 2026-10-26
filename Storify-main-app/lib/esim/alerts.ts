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

export async function alertSupplierProblem(providerCode: string, problem: SupplierProblem, detail: string) {
  const day = new Date().toISOString().slice(0, 10);
  await notifyAdminsPaymentAnomaly({
    title: TITLES[problem],
    message: `${providerCode}: ${detail}`.slice(0, 480),
    dedupeKey: `esim-supplier:${problem}:${providerCode}:${day}`,
    link: problem === "catalog" ? "/admin/esim/jobs" : "/admin/esim/providers",
  }).catch((error) => console.error("eSIM supplier alert failed:", error));
}
