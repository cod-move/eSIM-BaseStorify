import { walletAttributesOf, walletCreditOfOrder } from "@/lib/esim/wallet/booking";

/**
 * Referral rules (REF-01/02/04). Pure.
 *
 * Commission: a fixed amount or a percent of what a referred order paid,
 * on the referee's orders while the referral is valid (its validity days
 * after sign-up), for all their orders or only the first N. What an order
 * "paid" is its total less refunds and less any wallet top-up in it — buying
 * balance earns nothing; the balance spent later on eSIMs does.
 */

/** When a data reward is given: the friend's sign-up through the link, or their first order delivered. */
export type DataRewardTrigger = "signup" | "first_order";

/**
 * Data instead of money (二选一): the referrer gets `referrerMb` once per
 * friend, the friend gets `inviteeMb`, each at its own moment. Added to the
 * shopper's data balance (the check-in rewards balance), spent on eSIMs.
 */
export interface ReferralDataReward {
  referrerMb: number;
  referrerOn: DataRewardTrigger;
  inviteeMb: number;
  inviteeOn: DataRewardTrigger;
}

export interface ReferralSettings {
  enabled: boolean;
  /** "credit": a balance commission on the friend's orders (below); "data": the data rewards in `data`. */
  rewardType: "credit" | "data";
  data: ReferralDataReward;
  commissionType: "percent" | "fixed";
  /** Percent, or cents for a fixed commission. */
  commissionValue: number;
  /** Days after sign-up that orders earn commission; 0 = no end. */
  validityDays: number;
  /** Orders per referee that earn commission; 0 = all. */
  orderLimit: number;
  /** Percent of qualifying orders that earn nothing (扣量); 0 = none. */
  deductPercent: number;
  /** Days between an order's delivery and paying its commission. */
  holdDays: number;
  /**
   * Phone number eSIMs (and their top-ups) at a rate of their own: when on,
   * their share of an order earns this instead of the commission above.
   */
  numbers: { enabled: boolean; commissionType: "percent" | "fixed"; commissionValue: number };
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
  rewardType: "credit",
  data: { referrerMb: 1024, referrerOn: "first_order", inviteeMb: 500, inviteeOn: "first_order" },
  commissionType: "percent",
  commissionValue: 10,
  validityDays: 365,
  orderLimit: 0,
  deductPercent: 0,
  holdDays: 14,
  numbers: { enabled: false, commissionType: "percent", commissionValue: 10 },
  coupon: { enabled: false, type: "percentage", value: 10, days: 30, minOrderMinor: 0 },
};

/**
 * A referrer's own rules (REF-07), set by an admin: each field left null
 * follows the store-wide setting. Like the old system's per-user
 * commission type / value / validity / count.
 */
export interface ReferralOverride {
  enabled: boolean | null;
  rewardType: ReferralSettings["rewardType"] | null;
  referrerMb: number | null;
  referrerOn: DataRewardTrigger | null;
  inviteeMb: number | null;
  inviteeOn: DataRewardTrigger | null;
  commissionType: ReferralSettings["commissionType"] | null;
  /** Percent, or cents for a fixed commission. */
  commissionValue: number | null;
  validityDays: number | null;
  orderLimit: number | null;
  deductPercent: number | null;
  /** Number eSIMs' own rate for this referrer: set, their numbers earn it even when the store has none. */
  numbersCommissionType: ReferralSettings["commissionType"] | null;
  /** Percent, or cents for a fixed commission. */
  numbersCommissionValue: number | null;
}

/** The settings a referrer earns by: their own where set, the store's otherwise. */
export function effectiveReferralRule(settings: ReferralSettings, override?: Partial<ReferralOverride> | null): ReferralSettings {
  if (!override) return settings;
  const commissionType = override.commissionType ?? settings.commissionType;
  // A type changed without its own value has no value: the store's is in the other type's unit.
  const commissionValue = override.commissionValue ?? (commissionType === settings.commissionType ? settings.commissionValue : 0);
  return {
    ...settings,
    enabled: override.enabled ?? settings.enabled,
    rewardType: override.rewardType ?? settings.rewardType,
    data: {
      referrerMb: override.referrerMb ?? settings.data.referrerMb,
      referrerOn: override.referrerOn ?? settings.data.referrerOn,
      inviteeMb: override.inviteeMb ?? settings.data.inviteeMb,
      inviteeOn: override.inviteeOn ?? settings.data.inviteeOn,
    },
    commissionType,
    commissionValue,
    validityDays: override.validityDays ?? settings.validityDays,
    orderLimit: override.orderLimit ?? settings.orderLimit,
    deductPercent: override.deductPercent ?? settings.deductPercent,
    numbers: override.numbersCommissionType
      ? {
          enabled: true,
          commissionType: override.numbersCommissionType,
          // As above: a type changed without a value of its own has none.
          commissionValue:
            override.numbersCommissionValue ??
            (settings.numbers.enabled && override.numbersCommissionType === settings.numbers.commissionType ? settings.numbers.commissionValue : 0),
        }
      : settings.numbers,
  };
}

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

/** The rate a reward is earned at, kept on it so a later refund recomputes it alike. */
export interface CommissionRule {
  commissionType: "percent" | "fixed";
  commissionValue: number;
  /** Number eSIM lines' own rate; null or absent: they earn the rate above. */
  numbers?: { commissionType: "percent" | "fixed"; commissionValue: number } | null;
  /** Number top-ups earn nothing; absent on rewards earned before, which counted them. */
  skipNumberTopups?: boolean;
}

/** The rule a referrer's settings earn by now. */
export function commissionRuleOf(settings: Pick<ReferralSettings, "commissionType" | "commissionValue" | "numbers">): CommissionRule {
  return {
    commissionType: settings.commissionType,
    commissionValue: settings.commissionValue,
    numbers: settings.numbers?.enabled ? { commissionType: settings.numbers.commissionType, commissionValue: settings.numbers.commissionValue } : null,
    skipNumberTopups: true,
  };
}

/** A phone number eSIM line (lib/esim/numbers/cart-line.ts). */
export function isNumberLine(line: { lineAttributes?: unknown }): boolean {
  const number = attributeOf(line, "number");
  return Boolean(number && typeof number === "object");
}

/** A number top-up line: credit or a data package for a number already bought (lib/esim/numbers/topup.ts). */
export function isNumberTopupLine(line: { lineAttributes?: unknown }): boolean {
  const topup = attributeOf(line, "numberTopup");
  return Boolean(topup && typeof topup === "object");
}

function attributeOf(line: { lineAttributes?: unknown }, key: string): unknown {
  const attributes = line.lineAttributes;
  return attributes && typeof attributes === "object" ? (attributes as Record<string, unknown>)[key] : undefined;
}

type CommissionOrder = Parameters<typeof commissionBase>[0];

const cents = (value: number) => Math.round(value * 100) / 100;

/**
 * What a referred order earns under a rule: the base (commissionBase) and
 * the commission on it, the base shared among the lines by their prices.
 * - Wallet top-ups earn nothing (commissionBase leaves them out).
 * - Number top-ups earn nothing either (`skipNumberTopups`): an order of
 *   top-ups alone earns no commission. Rewards earned before that rule
 *   recompute as they were earned, top-ups included.
 * - With a rate of its own for numbers, number eSIMs' share earns that rate
 *   and the rest the main one; a fixed rate is paid once for each part the
 *   order has.
 */
export function orderCommission(order: CommissionOrder, rule: CommissionRule): { base: number; amount: number } {
  const paid = commissionBase(order);
  let numberGross = 0;
  let topupGross = 0;
  let otherGross = 0;
  for (const line of order.items ?? []) {
    if (walletAttributesOf(line)) continue;
    const gross = Math.max(0, Number(line.price) || 0) * Math.max(1, Number(line.quantity) || 1);
    if (isNumberLine(line)) numberGross += gross;
    else if (isNumberTopupLine(line)) topupGross += gross;
    else otherGross += gross;
  }
  const goods = numberGross + topupGross + otherGross;
  const shareOf = (gross: number) => (goods > 0 ? cents((paid * gross) / goods) : 0);
  const skip = rule.skipNumberTopups === true;
  const base = skip && goods > 0 ? Math.max(0, cents(paid - shareOf(topupGross))) : paid;
  if (!rule.numbers) return { base, amount: commissionFor(base, rule) };
  // Before top-ups were left out, they earned the numbers' rate with the numbers.
  const numberPart = skip ? numberGross : numberGross + topupGross;
  const numberBase = Math.min(base, shareOf(numberPart));
  const otherBase = Math.max(0, cents(base - numberBase));
  const amount = (otherGross > 0 ? commissionFor(otherBase, rule) : 0) + (numberPart > 0 ? commissionFor(numberBase, rule.numbers) : 0);
  return { base, amount: cents(Math.min(amount, base)) };
}

export type CommissionRefusal ="disabled" | "expired" | "limit";

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

/**
 * Whether an order falls in the deducted share (扣量): a stable 0–99 bucket
 * from the order id, so the same order always gets the same answer and a
 * retry never flips it.
 */
export function isDeducted(orderId: string, deductPercent: number): boolean {
  if (!(deductPercent > 0)) return false;
  if (deductPercent >= 100) return true;
  let hash = 2166136261;
  for (let index = 0; index < orderId.length; index += 1) hash = Math.imul(hash ^ orderId.charCodeAt(index), 16777619) >>> 0;
  return hash % 100 < deductPercent;
}

/**
 * Which data rewards a moment gives (both, one or none): the referrer's and
 * the friend's, each when its own trigger is this one and its amount is set.
 * Nothing when referrals are off or reward with money; the referrer's share
 * also falls in the deducted share (扣量) like a commission, by the referral.
 * A first order must come while the referral is valid.
 */
export function dataRewardsAt(
  trigger: DataRewardTrigger,
  input: { referralId: string; validUntil: Date | null; at: Date },
  settings: Pick<ReferralSettings, "enabled" | "rewardType" | "data" | "deductPercent">,
): { referrerMb: number; inviteeMb: number } {
  const none = { referrerMb: 0, inviteeMb: 0 };
  if (!settings.enabled || settings.rewardType !== "data") return none;
  if (trigger === "first_order" && input.validUntil && input.at > input.validUntil) return none;
  const referrerMb =
    settings.data.referrerOn === trigger && settings.data.referrerMb > 0 && !isDeducted(input.referralId, settings.deductPercent)
      ? Math.floor(settings.data.referrerMb)
      : 0;
  const inviteeMb = settings.data.inviteeOn === trigger && settings.data.inviteeMb > 0 ? Math.floor(settings.data.inviteeMb) : 0;
  return { referrerMb, inviteeMb };
}
