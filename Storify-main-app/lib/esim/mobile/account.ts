import { EsimReferralCode, EsimReferralCodeRequest, EsimReferrals, EsimWallet } from "@/contracts/mobile/shop/v1/esim";
import { MobileApiError } from "@/lib/api-core/errors";
import { defineRoute } from "@/lib/api-core/registry";
import { toMoney } from "@/lib/api-core/shop/money";
import { appBaseUrl } from "@/lib/app-url";
import { connectDB } from "@/lib/db";
import { referralCentre } from "@/lib/esim/referral/centre";
import { ReferralCodeError } from "@/lib/esim/referral/rules";
import { setReferralCode } from "@/lib/esim/referral/service";
import { findWalletProduct } from "@/lib/esim/wallet/product";
import { getStoreCurrency } from "@/lib/intl/server-currency";
import { storeCreditSummary } from "@/lib/store-credit/store-credit";
import { getEsimSettings } from "@/models/esim-pricing.model";

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
        orderLimit: offer.orderLimit,
        validityDays: offer.validityDays,
        ...(offer.coupon.enabled
          ? { friendDiscount: rate(offer.coupon.type === "percentage" ? "percent" : "fixed", offer.coupon.value) }
          : {}),
      },
      invited: centre.invited.map((entry) => ({
        id: entry.id,
        who: entry.who,
        joinedAt: new Date(entry.joinedAt).toISOString(),
        rewards: money(entry.rewards),
      })),
      rewards: centre.rewards.map((reward) => ({
        id: reward.id,
        orderNumber: reward.orderNumber,
        amount: money(reward.amount, reward.currency),
        status: reward.status,
        payableAt: new Date(reward.payableAt).toISOString(),
        ...(reward.creditedAt ? { creditedAt: new Date(reward.creditedAt).toISOString() } : {}),
      })),
      totals: { credited: money(centre.totals.paid), pending: money(centre.totals.pending) },
    };
  },
});

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
      return { code, link: `${appBaseUrl()}/esim/invite/${code}` };
    } catch (error) {
      if (error instanceof ReferralCodeError) throw new MobileApiError(422, "VALIDATION_ERROR", error.message);
      throw error;
    }
  },
});
