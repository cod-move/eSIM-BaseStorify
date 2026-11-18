import "server-only";

import * as z from "zod";
import { mongoose } from "@/lib/db";
import { runTransaction } from "@/lib/db-transaction";
import { User } from "@/models";
import { EsimProductLink } from "@/models/esim-product-link.model";
import {
  EsimRewardAccount,
  EsimRewardDay,
  EsimRewardEntry,
  EsimTelegramLink,
  EsimTelegramPending,
  EsimTelegramSettings,
  getTelegramSettings,
  type IEsimRewardEntry,
} from "@/models/esim-telegram.model";
import { sendEmail } from "@/lib/email/email";
import { escapeHtml } from "@/lib/email/escape-html";
import { dayKey, hashSecret, isTimezone, newEmailCode, newLinkToken, rollMb, withinCap } from "@/lib/esim/telegram/rules";
import { words, type BotLanguage } from "@/lib/esim/telegram/words";

/**
 * Telegram check-in rewards: linking a Telegram account to a store account
 * (from the website, or by a code mailed to the account), the daily check-in
 * in the store's groups, the balance, and spending it (lib/esim/telegram/redeem.ts).
 *
 * Every balance change runs in a transaction with its ledger row, and the
 * row's unique key makes a retried check-in or redemption count once.
 */

const LINK_TOKEN_MINUTES = 15;
const CODE_MINUTES = 10;
const CODE_ATTEMPTS = 5;
const CODE_SENDS_PER_HOUR = 3;

const isDuplicate = (error: unknown) => (error as { code?: number })?.code === 11000;
const oid = (id: string) => new mongoose.Types.ObjectId(id);

/** The Telegram user a message came from, as the webhook reads it. */
export interface TelegramSender {
  id: string;
  username: string | null;
  firstName: string | null;
  languageCode: string | null;
}

// ── Settings ─────────────────────────────────────────────────────────────

export const TelegramSettingsSchema = z
  .object({
    enabled: z.boolean(),
    groupIds: z.array(z.string().trim().regex(/^-?\d{1,20}$/, "A group ID is a number such as -1001234567890")).max(20),
    /** The group's invite link; empty for none. */
    groupLink: z
      .string()
      .trim()
      .max(300)
      .refine((value) => !value || /^https:\/\/(t\.me|telegram\.me)\/\S+$/i.test(value), "A Telegram link starts with https://t.me/"),
    minMb: z.number().int().min(1).max(100_000),
    maxMb: z.number().int().min(1).max(100_000),
    dailyCapMb: z.number().int().min(0).max(100_000_000),
    timezone: z.string().trim().min(1).max(64).refine(isTimezone, "Unknown time zone"),
    items: z
      .array(
        z.object({
          id: z.string().optional(),
          variantId: z.string().regex(/^[a-f0-9]{24}$/),
          costMb: z.number().int().min(1).max(10_000_000),
          enabled: z.boolean(),
        }),
      )
      .max(100),
  })
  .refine((value) => value.minMb <= value.maxMb, { message: "The smallest amount is more than the largest", path: ["minMb"] });

export type TelegramSettingsInput = z.infer<typeof TelegramSettingsSchema>;

export interface RewardItemView {
  id: string;
  productId: string;
  variantId: string;
  name: string;
  costMb: number;
  enabled: boolean;
}

export interface TelegramSettingsView {
  enabled: boolean;
  botUsername: string | null;
  groupIds: string[];
  groupLink: string | null;
  minMb: number;
  maxMb: number;
  dailyCapMb: number;
  timezone: string;
  items: RewardItemView[];
}

export async function telegramSettingsView(): Promise<TelegramSettingsView> {
  const settings = await getTelegramSettings();
  return {
    enabled: settings.enabled,
    botUsername: settings.botUsername,
    groupIds: [...settings.groupIds],
    groupLink: settings.groupLink ?? null,
    minMb: settings.minMb,
    maxMb: settings.maxMb,
    dailyCapMb: settings.dailyCapMb,
    timezone: settings.timezone,
    items: settings.items.map((item) => ({
      id: String(item._id),
      productId: String(item.productId),
      variantId: String(item.variantId),
      name: item.name,
      costMb: item.costMb,
      enabled: item.enabled,
    })),
  };
}

/** The published eSIM variants an admin can offer, for the item picker (day-priced ones are left out). */
export async function redeemableVariants(): Promise<Array<{ productId: string; variantId: string; name: string; priceMinor: number }>> {
  const links = await EsimProductLink.find()
    .select({ product: 1, productSlug: 1, variants: 1 })
    .populate<{ product: { _id: unknown; title?: string; name?: string } | null }>("product", { title: 1, name: 1 })
    .lean();
  return links.flatMap((link) =>
    link.variants
      .filter((variant) => !variant.perDay)
      .map((variant) => ({
        productId: String(link.product?._id ?? ""),
        variantId: String(variant.variantId),
        name: `${link.product?.title || link.product?.name || link.productSlug} · ${variant.name}`,
        priceMinor: variant.priceMinor,
      }))
      .filter((variant) => variant.productId),
  );
}

export async function saveTelegramSettings(input: TelegramSettingsInput) {
  const before = await telegramSettingsView();
  const variants = new Map((await redeemableVariants()).map((variant) => [variant.variantId, variant]));
  const items = input.items.map((item) => {
    const variant = variants.get(item.variantId);
    if (!variant) throw new Error(`The eSIM ${item.variantId} is no longer published`);
    return {
      ...(item.id && mongoose.isValidObjectId(item.id) ? { _id: oid(item.id) } : {}),
      productId: oid(variant.productId),
      variantId: oid(variant.variantId),
      name: variant.name,
      costMb: item.costMb,
      enabled: item.enabled,
    };
  });
  await EsimTelegramSettings.updateOne(
    { key: "default" },
    {
      $set: {
        enabled: input.enabled,
        groupIds: [...new Set(input.groupIds.map((id) => id.trim()))],
        groupLink: input.groupLink.trim() || null,
        minMb: input.minMb,
        maxMb: input.maxMb,
        dailyCapMb: input.dailyCapMb,
        timezone: input.timezone,
        items,
      },
    },
    { upsert: true },
  );
  return { before, after: await telegramSettingsView() };
}

// ── Linking ──────────────────────────────────────────────────────────────

/** A one-time start link for the bot that links this account (from the website). */
export async function createLinkToken(userId: string): Promise<string> {
  const token = newLinkToken();
  const now = Date.now();
  // One live link per account: asking again replaces the last.
  await EsimTelegramPending.deleteMany({ kind: "token", user: oid(userId) });
  await EsimTelegramPending.create({
    kind: "token",
    tokenHash: hashSecret(token),
    user: oid(userId),
    expiresAt: new Date(now + LINK_TOKEN_MINUTES * 60_000),
    purgeAt: new Date(now + LINK_TOKEN_MINUTES * 60_000),
  });
  return token;
}

/** Links the account to this Telegram user, replacing any earlier link of either. Answers the account's email. */
async function link(userId: string, sender: TelegramSender, via: "website" | "email"): Promise<string> {
  await runTransaction("esim-telegram-link", async (session) => {
    await EsimTelegramLink.deleteMany({ $or: [{ user: oid(userId) }, { telegramUserId: sender.id }] }, { session });
    await EsimTelegramLink.create(
      [{ user: oid(userId), telegramUserId: sender.id, username: sender.username, firstName: sender.firstName, languageCode: sender.languageCode, via }],
      { session },
    );
  });
  const user = await User.findById(userId).select({ email: 1 }).lean<{ email?: string } | null>();
  return user?.email ?? "";
}

/** The bot's /start <token>: links the account that made the token. Null when it is unknown or expired. */
export async function consumeLinkToken(token: string, sender: TelegramSender): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const pending = await EsimTelegramPending.findOneAndDelete({ kind: "token", tokenHash: hashSecret(token), expiresAt: { $gt: new Date() } }).lean();
  if (!pending?.user) return null;
  return link(String(pending.user), sender, "website");
}

export type CodeRequestResult = "sent" | "too_many";

/**
 * /bind <email>: mails a code to the account with that email. The answer is
 * the same whether or not there is such an account, so the bot cannot be used
 * to find out who has one.
 */
export async function requestEmailCode(sender: TelegramSender, email: string, language: BotLanguage): Promise<CodeRequestResult> {
  const now = Date.now();
  const existing = await EsimTelegramPending.findOne({ kind: "code", telegramUserId: sender.id }).lean();
  if (existing && existing.sends >= CODE_SENDS_PER_HOUR && existing.purgeAt.getTime() > now) return "too_many";
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select({ _id: 1, email: 1 }).lean<{ _id: unknown; email: string } | null>();
  const code = newEmailCode();
  // The window of a few codes an hour starts at the first one and is kept by `purgeAt`.
  const windowOpen = existing && existing.purgeAt.getTime() > now;
  await EsimTelegramPending.updateOne(
    { kind: "code", telegramUserId: sender.id },
    {
      $set: {
        user: user ? user._id : null,
        codeHash: user ? hashSecret(code) : null,
        attempts: 0,
        expiresAt: new Date(now + CODE_MINUTES * 60_000),
        ...(windowOpen ? {} : { purgeAt: new Date(now + 60 * 60_000), sends: 1 }),
      },
      ...(windowOpen ? { $inc: { sends: 1 } } : {}),
    },
    { upsert: true },
  ).catch((error) => {
    // Two asks at the same moment race on the unique index; the other one's code stands.
    if (!isDuplicate(error)) throw error;
  });
  if (user) {
    const say = words(language);
    await sendEmail({
      to: user.email,
      subject: say.emailSubject,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222"><p>${say.emailBody(escapeHtml(code))}</p></div>`,
      category: "esim-telegram",
    }).catch(console.error);
  }
  return "sent";
}

export type CodeCheckResult = { ok: true; email: string } | { ok: false; reason: "wrong" | "expired" };

/** A 6-digit code sent to the bot: links the account the code was mailed to. */
export async function verifyEmailCode(sender: TelegramSender, code: string): Promise<CodeCheckResult> {
  const pending = await EsimTelegramPending.findOne({ kind: "code", telegramUserId: sender.id });
  if (!pending || !pending.codeHash || pending.expiresAt.getTime() <= Date.now() || pending.attempts >= CODE_ATTEMPTS) {
    return { ok: false, reason: "expired" };
  }
  if (pending.codeHash !== hashSecret(code.trim())) {
    await EsimTelegramPending.updateOne({ _id: pending._id }, { $inc: { attempts: 1 } });
    return { ok: false, reason: pending.attempts + 1 >= CODE_ATTEMPTS ? "expired" : "wrong" };
  }
  // Spent: a code links once.
  await EsimTelegramPending.updateOne({ _id: pending._id }, { $set: { codeHash: null } });
  if (!pending.user) return { ok: false, reason: "expired" };
  return { ok: true, email: await link(String(pending.user), sender, "email") };
}

export async function unlinkTelegram(userId: string): Promise<boolean> {
  const result = await EsimTelegramLink.deleteOne({ user: oid(userId) });
  return result.deletedCount > 0;
}

export async function linkOfTelegramUser(telegramUserId: string) {
  return EsimTelegramLink.findOne({ telegramUserId }).lean();
}

// ── Check-in ─────────────────────────────────────────────────────────────

export type CheckinResult =
  | { status: "ok"; mb: number; balanceMb: number }
  | { status: "already"; balanceMb: number }
  | { status: "cap" }
  | { status: "not_linked" }
  | { status: "disabled" }
  | { status: "wrong_chat" };

class AlreadyCheckedIn extends Error {}
class CapReached extends Error {}

/** A check-in by this Telegram user in this chat. Once a day per Telegram account and per store account. */
export async function checkIn(sender: TelegramSender, chatId: string, now = new Date()): Promise<CheckinResult> {
  const settings = await getTelegramSettings();
  if (!settings.enabled) return { status: "disabled" };
  if (!settings.groupIds.includes(chatId)) return { status: "wrong_chat" };
  const linked = await linkOfTelegramUser(sender.id);
  if (!linked) return { status: "not_linked" };
  const user = linked.user;
  const day = dayKey(now, settings.timezone);
  // Keeps the admin's view current: a shopper may change their @username or name in Telegram.
  if (linked.username !== sender.username || linked.firstName !== sender.firstName || linked.languageCode !== sender.languageCode) {
    await EsimTelegramLink.updateOne(
      { _id: linked._id },
      { $set: { username: sender.username, firstName: sender.firstName, languageCode: sender.languageCode } },
    ).catch(console.error);
  }
  const rolled = rollMb(settings.minMb, settings.maxMb);

  // The rows the transaction updates exist first: an upsert inside it could clash with a concurrent insert.
  await EsimRewardAccount.updateOne({ user }, { $setOnInsert: { user } }, { upsert: true }).catch((error) => {
    if (!isDuplicate(error)) throw error;
  });
  if (settings.dailyCapMb) {
    await EsimRewardDay.updateOne({ day }, { $setOnInsert: { day } }, { upsert: true }).catch((error) => {
      if (!isDuplicate(error)) throw error;
    });
  }

  try {
    const result = await runTransaction("esim-telegram-checkin", async (session) => {
      let mb = rolled;
      if (settings.dailyCapMb) {
        const today = await EsimRewardDay.findOne({ day }).session(session).lean();
        mb = withinCap(rolled, today?.grantedMb ?? 0, settings.dailyCapMb);
        if (mb <= 0) throw new CapReached();
        await EsimRewardDay.updateOne({ day }, { $inc: { grantedMb: mb, checkins: 1 } }, { session });
      }
      const account = await EsimRewardAccount.findOneAndUpdate(
        { user, lastCheckinDay: { $ne: day } },
        { $inc: { balanceMb: mb, earnedMb: mb, checkins: 1 }, $set: { lastCheckinDay: day } },
        { session, returnDocument: "after" },
      ).lean();
      if (!account) throw new AlreadyCheckedIn();
      await EsimRewardEntry.create(
        [{ user, kind: "checkin", mb, key: `checkin:${sender.id}:${day}`, day, telegramUserId: sender.id, chatId, status: "done" }],
        { session },
      );
      return { mb, balanceMb: account.balanceMb };
    });
    return { status: "ok", ...result };
  } catch (error) {
    if (error instanceof CapReached) return { status: "cap" };
    if (error instanceof AlreadyCheckedIn || isDuplicate(error)) {
      const account = await EsimRewardAccount.findOne({ user }).lean();
      return { status: "already", balanceMb: account?.balanceMb ?? 0 };
    }
    throw error;
  }
}

// ── Balance and history ──────────────────────────────────────────────────

export async function rewardAccountOf(userId: string) {
  const account = await EsimRewardAccount.findOne({ user: oid(userId) }).lean();
  return {
    balanceMb: account?.balanceMb ?? 0,
    earnedMb: account?.earnedMb ?? 0,
    spentMb: account?.spentMb ?? 0,
    checkins: account?.checkins ?? 0,
    lastCheckinDay: account?.lastCheckinDay ?? null,
  };
}

export interface RewardEntryView {
  id: string;
  kind: IEsimRewardEntry["kind"];
  mb: number;
  status: IEsimRewardEntry["status"];
  itemName: string | null;
  orderId: string | null;
  orderNumber: string | null;
  note: string | null;
  createdAt: string;
}

export function entryView(entry: IEsimRewardEntry): RewardEntryView {
  return {
    id: String(entry._id),
    kind: entry.kind,
    mb: entry.mb,
    status: entry.status,
    itemName: entry.itemName,
    orderId: entry.order ? String(entry.order) : null,
    orderNumber: entry.orderNumber,
    note: entry.note,
    createdAt: entry.createdAt.toISOString(),
  };
}

export async function rewardHistory(userId: string, limit = 30): Promise<RewardEntryView[]> {
  const rows = await EsimRewardEntry.find({ user: oid(userId) }).sort({ createdAt: -1 }).limit(limit).lean<IEsimRewardEntry[]>();
  return rows.map(entryView);
}

/** What the account page shows: the link, the balance, the history and what can be bought with it. */
export async function rewardsPage(userId: string) {
  const [settings, linkRow, account, history] = await Promise.all([
    getTelegramSettings(),
    EsimTelegramLink.findOne({ user: oid(userId) }).lean(),
    rewardAccountOf(userId),
    rewardHistory(userId),
  ]);
  return {
    enabled: settings.enabled,
    botUsername: settings.botUsername,
    groupLink: settings.groupLink ?? null,
    link: linkRow ? { username: linkRow.username, firstName: linkRow.firstName, linkedAt: linkRow.createdAt.toISOString() } : null,
    account,
    history,
    items: settings.items
      .filter((item) => item.enabled)
      .sort((a, b) => a.costMb - b.costMb)
      .map((item) => ({ id: String(item._id), name: item.name, costMb: item.costMb })),
  };
}

// ── Admin ────────────────────────────────────────────────────────────────

/** An admin adds (+) or takes (−) data from a shopper's balance, with a reason. Never below zero. */
export async function adjustRewardBalance(input: { email: string; mb: number; note: string; by: string }) {
  const user = await User.findOne({ email: input.email.trim().toLowerCase() }).select({ _id: 1 }).lean<{ _id: mongoose.Types.ObjectId } | null>();
  if (!user) return { ok: false as const, reason: "no_user" as const };
  await EsimRewardAccount.updateOne({ user: user._id }, { $setOnInsert: { user: user._id } }, { upsert: true }).catch((error) => {
    if (!isDuplicate(error)) throw error;
  });
  const done = await runTransaction("esim-telegram-adjust", async (session) => {
    const account = await EsimRewardAccount.findOneAndUpdate(
      { user: user._id, ...(input.mb < 0 ? { balanceMb: { $gte: -input.mb } } : {}) },
      { $inc: { balanceMb: input.mb, ...(input.mb > 0 ? { earnedMb: input.mb } : {}) } },
      { session, returnDocument: "after" },
    ).lean();
    if (!account) return null;
    await EsimRewardEntry.create(
      [{ user: user._id, kind: "adjust", mb: input.mb, key: `adjust:${new mongoose.Types.ObjectId()}`, note: input.note, by: oid(input.by), status: "done" }],
      { session },
    );
    return account.balanceMb;
  });
  if (done === null) return { ok: false as const, reason: "not_enough" as const };
  return { ok: true as const, balanceMb: done };
}

/** A shopper's Telegram account as the admin sees it. */
export interface TelegramIdentity {
  telegramUserId: string;
  username: string | null;
  firstName: string | null;
}

export interface AdminRewardRow extends RewardEntryView {
  email: string | null;
  /** The Telegram account linked now (not necessarily the one a past check-in came from). */
  telegram: TelegramIdentity | null;
}

/** The latest ledger rows, newest first, with each shopper's email and Telegram account; `kind` narrows them. */
export async function adminRewardEntries(options: { kind?: IEsimRewardEntry["kind"]; limit?: number } = {}): Promise<AdminRewardRow[]> {
  const rows = await EsimRewardEntry.find(options.kind ? { kind: options.kind } : {})
    .sort({ createdAt: -1 })
    .limit(options.limit ?? 50)
    .lean<IEsimRewardEntry[]>();
  const ids = [...new Set(rows.map((row) => String(row.user)))].map(oid);
  const [users, links] = await Promise.all([
    User.find({ _id: { $in: ids } }).select({ email: 1 }).lean<Array<{ _id: unknown; email?: string }>>(),
    EsimTelegramLink.find({ user: { $in: ids } }).lean(),
  ]);
  const emailOf = new Map(users.map((user) => [String(user._id), user.email ?? null]));
  const telegramOf = new Map(
    links.map((entry) => [String(entry.user), { telegramUserId: entry.telegramUserId, username: entry.username, firstName: entry.firstName }]),
  );
  return rows.map((row) => ({ ...entryView(row), email: emailOf.get(String(row.user)) ?? null, telegram: telegramOf.get(String(row.user)) ?? null }));
}

export interface AdminLinkRow extends TelegramIdentity {
  userId: string;
  email: string | null;
  via: "website" | "email";
  linkedAt: string;
  checkins: number;
  balanceMb: number;
  lastCheckinDay: string | null;
}

const LINKS_PER_PAGE = 30;
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The linked accounts, newest first, a page at a time. `search` matches the
 * email, the @username (with or without @), the name or the Telegram ID.
 */
export async function adminTelegramLinks(options: { search?: string; page?: number } = {}) {
  const term = options.search?.trim().replace(/^@/, "") ?? "";
  const filter: Record<string, unknown> = {};
  if (term) {
    const pattern = new RegExp(escapeRegex(term), "i");
    const byEmail = await User.find({ email: pattern }).select({ _id: 1 }).limit(200).lean<Array<{ _id: mongoose.Types.ObjectId }>>();
    filter.$or = [{ username: pattern }, { firstName: pattern }, { telegramUserId: term }, { user: { $in: byEmail.map((user) => user._id) } }];
  }
  const total = await EsimTelegramLink.countDocuments(filter);
  const totalPages = Math.max(1, Math.ceil(total / LINKS_PER_PAGE));
  const page = Math.min(Math.max(1, Math.floor(options.page ?? 1) || 1), totalPages);
  const links = await EsimTelegramLink.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * LINKS_PER_PAGE)
    .limit(LINKS_PER_PAGE)
    .lean();
  const ids = links.map((entry) => entry.user);
  const [users, accounts] = await Promise.all([
    User.find({ _id: { $in: ids } }).select({ email: 1 }).lean<Array<{ _id: unknown; email?: string }>>(),
    EsimRewardAccount.find({ user: { $in: ids } }).lean(),
  ]);
  const emailOf = new Map(users.map((user) => [String(user._id), user.email ?? null]));
  const accountOf = new Map(accounts.map((account) => [String(account.user), account]));
  const rows: AdminLinkRow[] = links.map((entry) => {
    const account = accountOf.get(String(entry.user));
    return {
      userId: String(entry.user),
      email: emailOf.get(String(entry.user)) ?? null,
      telegramUserId: entry.telegramUserId,
      username: entry.username,
      firstName: entry.firstName,
      via: entry.via,
      linkedAt: entry.createdAt.toISOString(),
      checkins: account?.checkins ?? 0,
      balanceMb: account?.balanceMb ?? 0,
      lastCheckinDay: account?.lastCheckinDay ?? null,
    };
  });
  return { rows, page, totalPages, total };
}

/** Today's and all-time totals for the admin page. */
export async function rewardStats(now = new Date()) {
  const settings = await getTelegramSettings();
  const day = dayKey(now, settings.timezone);
  const [today, links, totals] = await Promise.all([
    EsimRewardEntry.aggregate<{ mb: number; count: number }>([
      { $match: { kind: "checkin", day } },
      { $group: { _id: null, mb: { $sum: "$mb" }, count: { $sum: 1 } } },
    ]),
    EsimTelegramLink.countDocuments(),
    EsimRewardAccount.aggregate<{ balance: number; earned: number; spent: number }>([
      { $group: { _id: null, balance: { $sum: "$balanceMb" }, earned: { $sum: "$earnedMb" }, spent: { $sum: "$spentMb" } } },
    ]),
  ]);
  return {
    day,
    todayCheckins: today[0]?.count ?? 0,
    todayMb: today[0]?.mb ?? 0,
    linkedAccounts: links,
    balanceMb: totals[0]?.balance ?? 0,
    earnedMb: totals[0]?.earned ?? 0,
    spentMb: totals[0]?.spent ?? 0,
  };
}
