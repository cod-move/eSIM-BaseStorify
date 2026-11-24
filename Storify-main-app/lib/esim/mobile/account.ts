import { EsimReferralCode, EsimReferralCodeRequest, EsimReferralFriends, EsimReferralFriendsQuery, EsimReferrals, EsimWallet } from "@/contracts/mobile/shop/v1/esim";
import { MobileApiError } from "@/lib/api-core/errors";
import { defineRoute } from "@/lib/api-core/registry";
import { toMoney } from "@/lib/api-core/shop/money";
import { appBaseUrl } from "@/lib/app-url";
import { connectDB } from "@/lib/db";
import { referralCentre, referralFriends, type FriendRow } from "@/lib/esim/referral/centre";
import { ReferralCodeError } from "@/lib/esim/referral/rules";
import { setReferralCode } from "@/lib/esim/referral/service";
import { findWalletProduct } from "@/lib/esim/wallet/product";
import { getStoreCurrency } from "@/lib/intl/server-currency";
import { storeCreditSummary } from "@/lib/store-credit/store-credit";
import { getEsimSettings } from "@/models/esim-pricing.model";
import { dataAmount } from "./rewards";

/**
 * The shopper app's balance and referrals (APP-07): the website's own readers
 * (lib/store-credit, lib/esim/wallet, lib/esim/referral/centre.ts).
 */

const PRESETS_MINOR = [1000, 2000, 5000, 10_000];

/** GET /me/esim-wallet */
export const esimWalletRoute = defineRoute({
  id: "me.esimWallet.get",
  method: "GET",
  path: "/me/esim-wallet",
  auth: "user",
  cache: { kind: "private" },
  output: EsimWallet,
  handler: async ({ session }) => {
    await connectDB();
    const [summary, settings, product, currency] = await Promise.all([
      storeCreditSummary(session.user.id),
      getEsimSettings(),
      findWalletProduct(),
      getStoreCurrency(),
    ]);
    const wallet = settings.wallet;
    const money = (minor: number) => toMoney(minor / 100, currency);
    const enabled = Boolean(wallet?.enabled && product);
    const min = wallet?.minMinor ?? 500;
    const max = wallet?.maxMinor ?? 100_000;
    return {
      balance: toMoney(summary.find((entry) => entry.currency === currency.code)?.balance ?? 0, currency),
      enabled,
      min: money(min),
      max: money(max),
      presets: PRESETS_MINOR.filter((value) => value >= min && value <= max).map(money),
      fee: { fixed: money(wallet?.feeFixedMinor ?? 0), percent: wallet?.feePercent ?? 0 },
      ...(enabled && product ? { product } : {}),
    };
  },
});

/** A friend in the contract's shape. */
function friendOf(entry: FriendRow, money: (amount: number) => ReturnType<typeof toMoney>) {
  return {
    id: entry.id,
    who: entry.who,
    joinedAt: new Date(entry.joinedAt).toISOString(),
    rewards: money(entry.rewards),
    ...(entry.dataMb > 0 ? { data: dataAmount(entry.dataMb) } : {}),
  };
}

/** GET /me/esim-referrals/friends?page= */
export const esimReferralFriendsRoute = defineRoute({
  id: "me.esimReferrals.friends",
  method: "GET",
  path: "/me/esim-referrals/friends",
  auth: "user",
  cache: { kind: "private" },
  input: EsimReferralFriendsQuery,
  output: EsimReferralFriends,
  handler: async ({ session, input }) => {
    await connectDB();
    const [friends, currency] = await Promise.all([referralFriends(session.user.id, input.page ?? 1), getStoreCurrency()]);
    return { ...friends, items: friends.items.map((entry) => friendOf(entry, (amount) => toMoney(amount, currency))) };
  },
});

/** GET /me/esim-referrals */
export const esimReferralsRoute = defineRoute({
  id: "me.esimReferrals.get",
  method: "GET",
  path: "/me/esim-referrals",
  auth: "user",
  cache: { kind: "private" },
  output: EsimReferrals,
  handler: async ({ session }) => {
    await connectDB();
    const [centre, currency] = await Promise.all([referralCentre(session.user.id), getStoreCurrency()]);
    const money = (amount: number, code = currency.code) => toMoney(amount, code === currency.code ? currency : code);
    const rate = (kind: "percent" | "fixed", value: number) =>
      kind === "percent" ? { kind: "percent" as const, percent: value } : { kind: "fixed" as const, amount: money(value / 100) };
    const { offer } = centre;
    return {
      enabled: centre.enabled,
      code: centre.code,
      link: centre.link,
      offer: {
        commission: rate(offer.commissionType, offer.commissionValue),
        ...(offer.numbers ? { numberCommission: rate(offer.numbers.commissionType, offer.numbers.commissionValue) } : {}),
        orderLimit: offer.orderLimit,
        validityDays: offer.validityDays,
        ...(offer.coupon.enabled
          ? { friendDiscount: rate(offer.coupon.type === "percentage" ? "percent" : "fixed", offer.coupon.value) }
          : {}),
        rewardType: offer.rewardType,
        data: {
          referrer: dataAmount(offer.data.referrerMb),
          referrerOn: offer.data.referrerOn,
          invitee: dataAmount(offer.data.inviteeMb),
          inviteeOn: offer.data.inviteeOn,
        },
      },
      invited: centre.invited.map((entry) => friendOf(entry, (amount) => money(amount))),
      invitedTotal: centre.invitedTotal,
      rewards: centre.rewards.map((reward) => ({
        id: reward.id,
        orderNumber: reward.orderNumber,
        amount: money(reward.amount, reward.currency),
        status: reward.status,
        payableAt: new Date(reward.payableAt).toISOString(),
        ...(reward.creditedAt ? { creditedAt: new Date(reward.creditedAt).toISOString() } : {}),
      })),
      dataRewards: centre.dataRewards.map((entry) => ({ id: entry.id, who: entry.who, data: dataAmount(entry.mb), at: new Date(entry.createdAt).toISOString() })),
      rewardsEver: centre.rewardsEver,
      totals: { credited: money(centre.totals.paid), pending: money(centre.totals.pending) },
      dataEarned: dataAmount(centre.dataEarnedMb),
      ...(centre.received
        ? {
            received: {
              from: centre.received.from,
              joinedAt: new Date(centre.received.joinedAt).toISOString(),
              ...(centre.received.dataMb > 0 ? { data: dataAmount(centre.received.dataMb) } : {}),
              ...(centre.received.dataAt ? { dataAt: new Date(centre.received.dataAt).toISOString() } : {}),
              ...(centre.received.pendingMb > 0 ? { pending: dataAmount(centre.received.pendingMb) } : {}),
            },
          }
        : {}),
      ...(centre.welcomeCoupon
        ? {
            welcomeCoupon: {
              code: centre.welcomeCoupon.code,
              discount: rate(centre.welcomeCoupon.type === "percentage" ? "percent" : "fixed", centre.welcomeCoupon.type === "percentage" ? centre.welcomeCoupon.value : Math.round(centre.welcomeCoupon.value * 100)),
              ...(centre.welcomeCoupon.minOrder > 0 ? { minOrder: money(centre.welcomeCoupon.minOrder) } : {}),
              ...(centre.welcomeCoupon.endsAt ? { endsAt: new Date(centre.welcomeCoupon.endsAt).toISOString() } : {}),
              active: centre.welcomeCoupon.active,
            },
          }
        : {}),
    };
  },
});

/** Why a code was refused, for the app to say in the shopper's language. */
function referralCodeReason(message: string): string {
  if (/taken/i.test(message)) return "REFERRAL_CODE_TAKEN";
  if (/reserved/i.test(message)) return "REFERRAL_CODE_RESERVED";
  return "REFERRAL_CODE_FORMAT";
}

/** PATCH /me/esim-referrals/code */
export const esimReferralCodeRoute = defineRoute({
  id: "me.esimReferrals.code",
  method: "PATCH",
  path: "/me/esim-referrals/code",
  auth: "user",
  cache: { kind: "private" },
  input: EsimReferralCodeRequest,
  output: EsimReferralCode,
  rateLimit: { bucket: "esim:referral:code", preset: "moderate" },
  demo: "block-mutations",
  handler: async ({ session, input }) => {
    await connectDB();
    try {
      const code = await setReferralCode(session.user.id, input.code);
      return { code, link: `${appBaseUrl()}/?ref=${code}` };
    } catch (error) {
      if (error instanceof ReferralCodeError) throw new MobileApiError(422, "VALIDATION_ERROR", error.message, { reason: referralCodeReason(error.message) });
      throw error;
    }
  },
});
