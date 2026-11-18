import { mongoose } from "@/lib/db";

const { Schema, models, model } = mongoose;

/**
 * Telegram check-in rewards (lib/esim/telegram): a shopper links their
 * Telegram account to their store account, checks in once a day in the
 * store's Telegram group for a random amount of data (in MB), and spends the
 * data saved up on an eSIM from a list the admin keeps.
 *
 * Amounts are whole megabytes. Every change to a balance is a ledger row with
 * a unique key, so a retried check-in or redemption is counted once.
 */

/** One settings document ("default"). The bot token and webhook secret are in .env, never here. */
export interface IEsimTelegramSettings extends mongoose.Document {
  key: string;
  enabled: boolean;
  /** The bot's @username, read from Telegram when the admin connects it. */
  botUsername: string | null;
  /** Chat ids of the groups where a check-in counts (e.g. "-1001234567890"). */
  groupIds: string[];
  minMb: number;
  maxMb: number;
  /** Most MB handed out by check-ins in one day, across everyone; 0 = no limit. */
  dailyCapMb: number;
  /** The time zone a check-in day runs in (IANA name). */
  timezone: string;
  /** What the saved-up data can be exchanged for: a published eSIM variant at a price in MB. */
  items: Array<{
    _id: mongoose.Types.ObjectId;
    productId: mongoose.Types.ObjectId;
    variantId: mongoose.Types.ObjectId;
    name: string;
    costMb: number;
    enabled: boolean;
  }>;
  updatedAt: Date;
}

const EsimTelegramSettingsSchema = new Schema<IEsimTelegramSettings>(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    enabled: { type: Boolean, default: false },
    botUsername: { type: String, default: null, maxlength: 64 },
    groupIds: { type: [{ type: String, maxlength: 32 }], default: [] },
    minMb: { type: Number, default: 10, min: 1, max: 100_000 },
    maxMb: { type: Number, default: 100, min: 1, max: 100_000 },
    dailyCapMb: { type: Number, default: 0, min: 0, max: 100_000_000 },
    timezone: { type: String, default: "Asia/Shanghai", maxlength: 64 },
    items: {
      type: [
        new Schema(
          {
            productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
            variantId: { type: Schema.Types.ObjectId, required: true },
            name: { type: String, required: true, maxlength: 200 },
            costMb: { type: Number, required: true, min: 1, max: 10_000_000 },
            enabled: { type: Boolean, default: true },
          },
          { _id: true },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true },
);

/** A store account and the Telegram account linked to it: one each way. */
export interface IEsimTelegramLink extends mongoose.Document {
  user: mongoose.Types.ObjectId;
  telegramUserId: string;
  username: string | null;
  firstName: string | null;
  languageCode: string | null;
  via: "website" | "email";
  createdAt: Date;
}

const EsimTelegramLinkSchema = new Schema<IEsimTelegramLink>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    telegramUserId: { type: String, required: true, unique: true },
    username: { type: String, default: null },
    firstName: { type: String, default: null },
    languageCode: { type: String, default: null },
    via: { type: String, enum: ["website", "email"], required: true },
  },
  { timestamps: true },
);

/**
 * A pending link: from the website (a one-time token in the bot's start
 * link, `tokenHash` set) or by email (a 6-digit code mailed to the account,
 * `codeHash` set, keyed by the Telegram user asking). Only hashes are kept;
 * Mongo removes the row once `purgeAt` passes.
 */
export interface IEsimTelegramPending extends mongoose.Document {
  kind: "token" | "code";
  tokenHash: string | null;
  user: mongoose.Types.ObjectId | null;
  telegramUserId: string | null;
  codeHash: string | null;
  attempts: number;
  /** Codes mailed in the current window (at most a few per hour). */
  sends: number;
  expiresAt: Date;
  purgeAt: Date;
}

const EsimTelegramPendingSchema = new Schema<IEsimTelegramPending>(
  {
    kind: { type: String, enum: ["token", "code"], required: true },
    tokenHash: { type: String, default: null },
    user: { type: Schema.Types.ObjectId, ref: "User", default: null },
    telegramUserId: { type: String, default: null },
    codeHash: { type: String, default: null },
    attempts: { type: Number, default: 0 },
    sends: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
    purgeAt: { type: Date, required: true },
  },
  { timestamps: true },
);
EsimTelegramPendingSchema.index({ tokenHash: 1 }, { unique: true, partialFilterExpression: { kind: "token" } });
EsimTelegramPendingSchema.index({ telegramUserId: 1 }, { unique: true, partialFilterExpression: { kind: "code" } });
EsimTelegramPendingSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

/** A shopper's saved-up data. `lastCheckinDay` is the day key of their last check-in. */
export interface IEsimRewardAccount extends mongoose.Document {
  user: mongoose.Types.ObjectId;
  balanceMb: number;
  earnedMb: number;
  spentMb: number;
  checkins: number;
  lastCheckinDay: string | null;
  updatedAt: Date;
}

const EsimRewardAccountSchema = new Schema<IEsimRewardAccount>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    balanceMb: { type: Number, default: 0, min: 0 },
    earnedMb: { type: Number, default: 0, min: 0 },
    spentMb: { type: Number, default: 0, min: 0 },
    checkins: { type: Number, default: 0, min: 0 },
    lastCheckinDay: { type: String, default: null },
  },
  { timestamps: true },
);

export type RewardEntryKind = "checkin" | "redeem" | "refund" | "adjust";

/**
 * Every change to a balance. `key` is unique: `checkin:<telegram id>:<day>`,
 * `redeem:<user>:<request id>`, `refund:<redeem entry>`, `adjust:<id>`.
 * A redemption is `pending` until its order exists, then `done` with the
 * order; one whose order could not be made is `failed` and refunded.
 */
export interface IEsimRewardEntry extends mongoose.Document {
  user: mongoose.Types.ObjectId;
  kind: RewardEntryKind;
  /** Signed: + earned or given back, − spent or taken. */
  mb: number;
  key: string;
  day: string | null;
  telegramUserId: string | null;
  chatId: string | null;
  itemId: mongoose.Types.ObjectId | null;
  itemName: string | null;
  order: mongoose.Types.ObjectId | null;
  orderNumber: string | null;
  status: "done" | "pending" | "failed";
  note: string | null;
  by: mongoose.Types.ObjectId | null;
  createdAt: Date;
}

const EsimRewardEntrySchema = new Schema<IEsimRewardEntry>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, enum: ["checkin", "redeem", "refund", "adjust"], required: true },
    mb: { type: Number, required: true },
    key: { type: String, required: true, unique: true },
    day: { type: String, default: null },
    telegramUserId: { type: String, default: null },
    chatId: { type: String, default: null },
    itemId: { type: Schema.Types.ObjectId, default: null },
    itemName: { type: String, default: null },
    order: { type: Schema.Types.ObjectId, ref: "Order", default: null },
    orderNumber: { type: String, default: null },
    status: { type: String, enum: ["done", "pending", "failed"], default: "done" },
    note: { type: String, default: null, maxlength: 500 },
    by: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
EsimRewardEntrySchema.index({ user: 1, createdAt: -1 });
EsimRewardEntrySchema.index({ kind: 1, createdAt: -1 });

/** MB handed out by check-ins on one day, for the daily cap. */
export interface IEsimRewardDay extends mongoose.Document {
  day: string;
  grantedMb: number;
  checkins: number;
}

const EsimRewardDaySchema = new Schema<IEsimRewardDay>({
  day: { type: String, required: true, unique: true },
  grantedMb: { type: Number, default: 0 },
  checkins: { type: Number, default: 0 },
});

for (const name of ["EsimTelegramSettings", "EsimTelegramLink", "EsimTelegramPending", "EsimRewardAccount", "EsimRewardEntry", "EsimRewardDay"]) {
  if (models[name]) delete models[name];
}

export const EsimTelegramSettings = model<IEsimTelegramSettings>("EsimTelegramSettings", EsimTelegramSettingsSchema);
export const EsimTelegramLink = model<IEsimTelegramLink>("EsimTelegramLink", EsimTelegramLinkSchema);
export const EsimTelegramPending = model<IEsimTelegramPending>("EsimTelegramPending", EsimTelegramPendingSchema);
export const EsimRewardAccount = model<IEsimRewardAccount>("EsimRewardAccount", EsimRewardAccountSchema);
export const EsimRewardEntry = model<IEsimRewardEntry>("EsimRewardEntry", EsimRewardEntrySchema);
export const EsimRewardDay = model<IEsimRewardDay>("EsimRewardDay", EsimRewardDaySchema);

export async function getTelegramSettings(): Promise<IEsimTelegramSettings> {
  return EsimTelegramSettings.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { key: "default" } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ) as Promise<IEsimTelegramSettings>;
}
