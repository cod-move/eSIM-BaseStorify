import "server-only";

import { mongoose } from "@/lib/db";
import { CustomerProfile } from "@/models";
import { Coupon, CouponStatus, CouponType } from "@/models/coupon.model";
import { getEsimSettings } from "@/models/esim-pricing.model";
import { EsimReferral, EsimReferralCode } from "@/models/esim-referral.model";
import {
  DEFAULT_REFERRAL_SETTINGS,
  ReferralCodeError,
  generateCode,
  normalizeCode,
  referralValidUntil,
  type ReferralSettings,
} from "@/lib/esim/referral/rules";

/**
 * Referral codes and sign-ups (REF-01/06). A shopper's code is made the
 * first time it is asked for; they may replace it with one of their own.
 * Someone who opens an invite link (/esim/invite/<code>) carries the code in
 * a cookie, and signing up records whose referral they are (patch P14) and,
 * when the store offers one, gives them a welcome coupon of their own.
 */

export const REFERRAL_COOKIE = "esim_ref";
export const REFERRAL_COOKIE_DAYS = 30;

export async function getReferralSettings(): Promise<ReferralSettings> {
  const stored = (await getEsimSettings()).referral;
  const defaults = DEFAULT_REFERRAL_SETTINGS;
  return {
    enabled: stored?.enabled ?? defaults.enabled,
    commissionType: stored?.commissionType ?? defaults.commissionType,
    commissionValue: stored?.commissionValue ?? defaults.commissionValue,
    validityDays: stored?.validityDays ?? defaults.validityDays,
    orderLimit: stored?.orderLimit ?? defaults.orderLimit,
    holdDays: stored?.holdDays ?? defaults.holdDays,
    coupon: {
      enabled: stored?.coupon?.enabled ?? defaults.coupon.enabled,
      type: stored?.coupon?.type ?? defaults.coupon.type,
      value: stored?.coupon?.value ?? defaults.coupon.value,
      days: stored?.coupon?.days ?? defaults.coupon.days,
      minOrderMinor: stored?.coupon?.minOrderMinor ?? defaults.coupon.minOrderMinor,
    },
  };
}

const isDuplicate = (error: unknown) => (error as { code?: number })?.code === 11000;

/** The shopper's code, made on first ask. */
export async function ensureReferralCode(userId: string): Promise<string> {
  const existing = await EsimReferralCode.findOne({ user: userId }).lean();
  if (existing) return existing.code;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const created = await EsimReferralCode.create({ user: new mongoose.Types.ObjectId(userId), code: generateCode() });
      return created.code;
    } catch (error) {
      if (!isDuplicate(error)) throw error;
      const raced = await EsimReferralCode.findOne({ user: userId }).lean();
      if (raced) return raced.code;
    }
  }
  throw new Error("Could not make a referral code");
}

/** Replaces the shopper's code with one they chose (REF-05); refuses one that is taken. */
export async function setReferralCode(userId: string, input: string): Promise<string> {
  const code = normalizeCode(input);
  await ensureReferralCode(userId);
  const taken = await EsimReferralCode.findOne({ code, user: { $ne: userId } }).lean();
  if (taken) throw new ReferralCodeError("That code is taken");
  try {
    await EsimReferralCode.updateOne({ user: userId }, { $set: { code, custom: true } });
  } catch (error) {
    if (isDuplicate(error)) throw new ReferralCodeError("That code is taken");
    throw error;
  }
  return code;
}

/** Whether an invite code belongs to someone (the invite link checks it before setting the cookie). */
export async function referralCodeExists(code: string): Promise<boolean> {
  try {
    return Boolean(await EsimReferralCode.exists({ code: normalizeCode(code) }));
  } catch {
    return false;
  }
}

/** The invite code in a Cookie header, if any. */
export function referralCodeFromCookie(header: string | null | undefined): string | null {
  for (const part of String(header ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === REFERRAL_COOKIE) {
      try {
        return normalizeCode(decodeURIComponent(rest.join("=")));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** A one-use welcome coupon, for this shopper only (REF-06). */
async function welcomeCoupon(userId: string, settings: ReferralSettings): Promise<string | null> {
  if (!settings.coupon.enabled || !(settings.coupon.value > 0)) return null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = `WELCOME${generateCode()}`;
    try {
      await Coupon.create({
        code,
        label: "Referral welcome",
        description: "Welcome discount for a referred shopper",
        type: settings.coupon.type === "fixed" ? CouponType.FIXED : CouponType.PERCENTAGE,
        value: settings.coupon.type === "fixed" ? settings.coupon.value / 100 : settings.coupon.value,
        minOrderAmount: settings.coupon.minOrderMinor / 100,
        usageLimit: 1,
        perUserLimit: 1,
        startDate: new Date(),
        endDate: new Date(Date.now() + settings.coupon.days * 86_400_000),
        status: CouponStatus.ACTIVE,
        fundedBy: "platform",
        restrictedToUserId: new mongoose.Types.ObjectId(userId),
        createdBy: "esim-referral",
      });
      return code;
    } catch (error) {
      if (!isDuplicate(error)) throw error;
    }
  }
  return null;
}

/**
 * A new account opened with an invite code: who referred them, and their
 * welcome coupon. Once per account; a shopper cannot refer themselves.
 */
export async function recordSignupReferral(userId: string, code: string | null): Promise<{ referrer: string; couponCode: string | null } | null> {
  if (!code || !mongoose.isValidObjectId(userId)) return null;
  const settings = await getReferralSettings();
  if (!settings.enabled) return null;
  const owner = await EsimReferralCode.findOne({ code }).lean();
  if (!owner || String(owner.user) === userId) return null;
  if (await EsimReferral.exists({ referee: userId })) return null;
  const now = new Date();
  let referral;
  try {
    referral = await EsimReferral.create({
      referrer: owner.user,
      referee: new mongoose.Types.ObjectId(userId),
      code,
      validUntil: referralValidUntil(now, settings.validityDays),
    });
  } catch (error) {
    if (isDuplicate(error)) return null;
    throw error;
  }
  // Storify's own field for it, so the customer screens can show it too.
  await CustomerProfile.updateOne({ userId }, { $set: { referredBy: owner.user } }).catch(() => undefined);
  const couponCode = await welcomeCoupon(userId, settings).catch((error) => {
    console.error("Referral welcome coupon failed:", error);
    return null;
  });
  if (couponCode) await EsimReferral.updateOne({ _id: referral._id }, { $set: { couponCode } });
  return { referrer: String(owner.user), couponCode };
}

/** Called by the sign-up hook (patch P14) with the request's headers; never throws. */
export async function esimOnUserCreated(user: { id?: string; _id?: { toString(): string }; role?: string }, headers: Headers | null | undefined) {
  try {
    if (user.role && user.role !== "customer") return;
    const userId = user.id || user._id?.toString();
    if (!userId) return;
    await recordSignupReferral(userId, referralCodeFromCookie(headers?.get("cookie")));
  } catch (error) {
    console.error("Recording a referral failed:", error);
  }
}
