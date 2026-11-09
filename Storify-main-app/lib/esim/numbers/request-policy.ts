import type { LegResult } from "@/lib/esim/numbers/op-policy";

/**
 * Rules for a number request (lib/esim/numbers/requests.ts). Pure, so the
 * page, the routes and the tests agree.
 */

export type QrLeg = "charge" | "refund";

/**
 * After one leg of a new-QR-code fee: a taken fee waits for a person; a
 * refused one took nothing; a refund that fails leaves the fee on the
 * dealer account, for a person.
 */
export function afterQrLeg(leg: QrLeg, result: LegResult): "pending" | "failed" | "rejected" | "wait" | "manual" {
  if (result === "wait") return "wait";
  if (result === "manual") return "manual";
  if (leg === "charge") return result === "done" ? "pending" : "failed";
  return result === "done" ? "rejected" : "manual";
}

/** The card must keep more than nothing after the fee (as other number shops ask). */
export function canAffordQr(balanceMinor: number | null | undefined, feeMinor: number): true | false | "unknown" {
  if (feeMinor <= 0) return true;
  if (typeof balanceMinor !== "number") return "unknown";
  return balanceMinor - feeMinor >= 1;
}
