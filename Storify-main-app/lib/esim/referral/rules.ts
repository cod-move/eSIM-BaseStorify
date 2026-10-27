import { walletCreditOfOrder } from "@/lib/esim/wallet/booking";

/**
 * Referral rules (REF-01/02/04). Pure.
 *
 * Commission: a fixed amount or a percent of what a referred order paid,
 * on the referee's orders while the referral is valid (its validity days
 * after sign-up), for all their orders or only the first N. What an order
 * "paid" is its total less refunds and less any wallet top-up in it — buying
 * balance earns nothing; the balance spent later on eSIMs does.
 */

export interface ReferralSettings {
  enabled: boolean;
  commissionType: "percent" | "fixed";
  /** Percent, or cents for a fixed commission. */
  commissionValue: number;
  /** Days after sign-up that orders earn commission; 0 = no end. */
  validityDays: number;
  /** Orders per referee that earn commission; 0 = all. */
  orderLimit: number;
  /** Days between an order's delivery and paying its commission. */
  holdDays: number;
  coupon: {
    enabled: boolean;
    type: "percentage" | "fixed";
    /** Percent, or cents for a fixed discount. */
    value: number;
    days: number;
    minOrderMinor: number;
  };
}

export const DEFAULT_REFERRAL_SETTINGS: ReferralSettings = {
  enabled: false,
  commissionType: "percent",
  commissionValue: 10,
  validityDays: 365,
  orderLimit: 0,
  holdDays: 14,
  coupon: { enabled: false, type: "percentage", value: 10, days: 30, minOrderMinor: 0 },
};

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RESERVED = new Set(["ADMIN", "STORE", "ESIM", "SUPPORT", "TEST", "NULL", "UNDEFINED"]);

export class ReferralCodeError extends Error {}

/** A code a shopper chose: 4–16 letters and digits, kept upper-case. */
export function normalizeCode(input: string): string {
  const code = input.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,16}$/.test(code)) throw new ReferralCodeError("Use 4 to 16 letters and digits");
  if (RESERVED.has(code)) throw new ReferralCodeError("That code is reserved");
  return code;
}

/** A random 8-character code without look-alike characters (0/O, 1/I). */
export function generateCode(random: () => number = Math.random): string {
  let code = "";
  for (let index = 0; index < 8; index += 1) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return code;
}

/** The commission on a base, rounded down to the cent; never more than the base. */
export function commissionFor(base: number, settings: Pick<ReferralSettings, "commissionType" | "commissionValue">): number {
  if (!(base > 0)) return 0;
  const raw = settings.commissionType === "fixed" ? settings.commissionValue / 100 : (base * settings.commissionValue) / 100;
  return Math.floor(Math.min(raw, base) * 100 + 1e-6) / 100;
}

/** What a referred order paid that earns commission: total less refunds and wallet top-ups. */
export function commissionBase(order: Parameters<typeof walletCreditOfOrder>[0] & { refundedTotal?: number | null }): number {
  const paid = Number(order.total || 0) - Number(order.refundedTotal || 0) - walletCreditOfOrder(order);
  return Math.max(0, Math.round(paid * 100) / 100);
}

export type CommissionRefusal = "disabled" | "expired" | "limit";

/** Whether a referee's order earns commission, given how many already did. */
export function commissionAllowed(
  input: { validUntil: Date | null; orderDate: Date; earnedSoFar: number },
  settings: Pick<ReferralSettings, "enabled" | "orderLimit">,
): { ok: true } | { ok: false; reason: CommissionRefusal } {
  if (!settings.enabled) return { ok: false, reason: "disabled" };
  if (input.validUntil && input.orderDate > input.validUntil) return { ok: false, reason: "expired" };
  if (settings.orderLimit > 0 && input.earnedSoFar >= settings.orderLimit) return { ok: false, reason: "limit" };
  return { ok: true };
}

/** When a referral made now stops earning: validity days on, or never. */
export function referralValidUntil(signedUpAt: Date, validityDays: number): Date | null {
  return validityDays > 0 ? new Date(signedUpAt.getTime() + validityDays * 86_400_000) : null;
}
