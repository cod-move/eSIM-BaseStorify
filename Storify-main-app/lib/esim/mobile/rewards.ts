import {
  EsimRewards,
  EsimRewardsEmptyInput,
  EsimRewardsHistory,
  EsimRewardsHistoryQuery,
  EsimRewardsRedeemRequest,
  EsimRewardsRedeemResult,
  EsimRewardsTelegramLink,
} from "@/contracts/mobile/shop/v1/esim";
import * as z from "zod";
import { MobileApiError } from "@/lib/api-core/errors";
import { defineRoute } from "@/lib/api-core/registry";
import { shopAppAuditContext } from "@/lib/api-core/shop/audit-context";
import { connectDB } from "@/lib/db";
import { getTelegramSettings } from "@/models/esim-telegram.model";
import { esimFulfilOrder } from "@/lib/esim/fulfillment";
import { runAfterResponse } from "@/lib/esim/admin/route";
import { formatMb } from "@/lib/esim/telegram/format";
import { redeemReward } from "@/lib/esim/telegram/redeem";
import { createLinkToken, rewardHistory, rewardsPage, unlinkTelegram, type RewardEntryView } from "@/lib/esim/telegram/service";

/**
 * The shopper app's rewards centre (福利中心): the website's own readers and
 * writers (lib/esim/telegram) in the contract's shape. Invite friends and the
 * data received for joining are the referral centre's (GET /me/esim-referrals).
 */

/** An amount in MB as the app shows it: bytes, and the text to print. */
export const dataAmount = (mb: number) => ({ bytes: Math.round(mb * 1024 * 1024), formatted: formatMb(mb) });

/** GET /me/esim-rewards */
export const esimRewardsRoute = defineRoute({
  id: "me.esimRewards.get",
  method: "GET",
  path: "/me/esim-rewards",
  auth: "user",
  cache: { kind: "private" },
  output: EsimRewards,
  handler: async ({ session }) => {
    await connectDB();
    const page = await rewardsPage(session.user.id);
    return {
      enabled: page.enabled,
      balance: dataAmount(page.account.balanceMb),
      earned: dataAmount(page.account.earnedMb),
      spent: dataAmount(page.account.spentMb),
      checkins: page.account.checkins,
      telegram: {
        ...(page.botUsername ? { bot: page.botUsername } : {}),
        ...(page.groupLink ? { groupLink: page.groupLink } : {}),
        ...(page.link
          ? {
              linked: {
                ...(page.link.username ? { username: page.link.username } : {}),
                ...(page.link.firstName ? { name: page.link.firstName } : {}),
                linkedAt: page.link.linkedAt,
              },
            }
          : {}),
      },
      items: page.items.map((item) => ({ id: item.id, name: item.name, cost: dataAmount(item.costMb) })),
      history: page.history.items.map(entryOf),
      historyPages: page.history.totalPages,
      ...(page.limit
        ? { checkinLimit: { period: page.limit.period, cap: dataAmount(page.limit.capMb), used: dataAmount(Math.min(page.limit.usedMb, page.limit.capMb)) } }
        : {}),
    };
  },
});

function entryOf(entry: RewardEntryView) {
  return {
    id: entry.id,
    kind: entry.kind,
    amount: dataAmount(entry.mb),
    status: entry.status,
    ...(entry.itemName ? { itemName: entry.itemName } : {}),
    ...(entry.orderId ? { orderId: entry.orderId } : {}),
    ...(entry.orderNumber ? { orderNumber: entry.orderNumber } : {}),
    ...(entry.note ? { note: entry.note } : {}),
    createdAt: entry.createdAt,
  };
}

/** GET /me/esim-rewards/history?page= */
export const esimRewardsHistoryRoute = defineRoute({
  id: "me.esimRewards.history",
  method: "GET",
  path: "/me/esim-rewards/history",
  auth: "user",
  cache: { kind: "private" },
  input: EsimRewardsHistoryQuery,
  output: EsimRewardsHistory,
  handler: async ({ session, input }) => {
    await connectDB();
    const history = await rewardHistory(session.user.id, input.page ?? 1);
    return { ...history, items: history.items.map(entryOf) };
  },
});

/** POST /me/esim-rewards/telegram: a one-time link that opens the bot and links this account. */
export const esimRewardsTelegramLinkRoute = defineRoute({
  id: "me.esimRewards.telegramLink",
  method: "POST",
  path: "/me/esim-rewards/telegram",
  auth: "user",
  cache: { kind: "private" },
  input: EsimRewardsEmptyInput,
  output: EsimRewardsTelegramLink,
  rateLimit: { bucket: "esim:telegram:link", preset: "strict" },
  demo: "block-mutations",
  handler: async ({ session }) => {
    await connectDB();
    const settings = await getTelegramSettings();
    if (!settings.botUsername) throw new MobileApiError(409, "CONFLICT", "The Telegram bot is not set up yet.", { reason: "BOT_NOT_SET_UP" });
    const token = await createLinkToken(session.user.id);
    return { url: `https://t.me/${settings.botUsername}?start=${token}` };
  },
});

/** DELETE /me/esim-rewards/telegram: unlinks Telegram; the data saved stays. */
export const esimRewardsTelegramUnlinkRoute = defineRoute({
  id: "me.esimRewards.telegramUnlink",
  method: "DELETE",
  path: "/me/esim-rewards/telegram",
  auth: "user",
  cache: { kind: "private" },
  output: z.object({ unlinked: z.boolean() }),
  rateLimit: { bucket: "esim:telegram:link", preset: "moderate" },
  demo: "block-mutations",
  handler: async ({ session }) => {
    await connectDB();
    return { unlinked: await unlinkTelegram(session.user.id) };
  },
});

const REFUSAL = {
  disabled: { reason: "DISABLED", message: "Check-in rewards are not open at the moment." },
  no_item: { reason: "NO_ITEM", message: "This eSIM can no longer be exchanged." },
  not_enough: { reason: "NOT_ENOUGH", message: "Not enough data saved for this eSIM." },
  failed: { reason: "FAILED", message: "The exchange did not go through and your data was given back." },
} as const;

/** POST /me/esim-rewards/redeem: spends saved data on an eSIM. */
export const esimRewardsRedeemRoute = defineRoute({
  id: "me.esimRewards.redeem",
  method: "POST",
  path: "/me/esim-rewards/redeem",
  auth: "user",
  cache: { kind: "private" },
  input: EsimRewardsRedeemRequest,
  output: EsimRewardsRedeemResult,
  rateLimit: { bucket: "esim:telegram:redeem", preset: "strict" },
  demo: "block-mutations",
  handler: async ({ session, input, client, requestId, locale }) => {
    await connectDB();
    const result = await redeemReward({
      userId: session.user.id,
      itemId: input.itemId,
      requestId: input.requestId,
      audit: shopAppAuditContext({ session, client, requestId, locale, method: "POST", path: "/me/esim-rewards/redeem" }),
    });
    if (!result.ok) {
      const refusal = REFUSAL[result.reason];
      throw new MobileApiError(409, "CONFLICT", refusal.message, { reason: refusal.reason });
    }
    await runAfterResponse(() => esimFulfilOrder(result.orderId).then(() => undefined, (error) => console.error("Reward eSIM fulfilment failed:", error)));
    return { orderId: result.orderId, orderNumber: result.orderNumber, balance: dataAmount(result.balanceMb) };
  },
});

export const esimRewardsRoutes = [esimRewardsRoute, esimRewardsHistoryRoute, esimRewardsTelegramLinkRoute, esimRewardsTelegramUnlinkRoute, esimRewardsRedeemRoute];
