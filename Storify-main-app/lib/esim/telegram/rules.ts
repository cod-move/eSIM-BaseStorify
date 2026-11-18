import { createHash, randomBytes, randomInt } from "node:crypto";

/**
 * The arithmetic of Telegram check-in rewards, apart from the database so it
 * can be tested: which day it is, how much one check-in gives, how an amount
 * prints, and how a Telegram message is read as a command.
 */

/** The day a check-in counts for, "2026-11-17", in the store's time zone (UTC if the name is unknown). */
export function dayKey(now: Date, timezone: string): string {
  const format = (timeZone: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  try {
    return format(timezone || "UTC");
  } catch {
    return format("UTC");
  }
}

export function isTimezone(name: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

/** A whole number of MB between `min` and `max`, both included (in either order). */
export function rollMb(min: number, max: number, draw: (low: number, highExclusive: number) => number = randomInt): number {
  const low = Math.max(1, Math.floor(Math.min(min, max)));
  const high = Math.max(low, Math.floor(Math.max(min, max)));
  return draw(low, high + 1);
}

/** What one check-in gives once the day's cap is counted: the roll, cut to what is left, or 0 when none is. */
export function withinCap(rolled: number, grantedToday: number, dailyCapMb: number): number {
  if (!dailyCapMb) return rolled;
  return Math.max(0, Math.min(rolled, dailyCapMb - grantedToday));
}

export { formatMb } from "@/lib/esim/telegram/format";

/** A one-time secret for a link or code, and the hash kept in its place. */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** A token for the bot's start link: Telegram allows 64 characters of A-Z a-z 0-9 _ -. */
export function newLinkToken(): string {
  return randomBytes(24).toString("base64url");
}

export function newEmailCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export type BotCommand =
  | { name: "checkin" }
  | { name: "start"; arg: string }
  | { name: "bind"; arg: string }
  | { name: "code"; arg: string }
  | { name: "balance" }
  | { name: "chatid" }
  | { name: "help" }
  | null;

/**
 * Reads a message as a command. `/checkin@OurBot` counts only when it names
 * this bot (another bot's command in the same group is left alone); "签到"
 * and "checkin" work without the slash, and six digits on their own are an
 * email code.
 */
export function parseCommand(text: string | undefined, botUsername: string | null): BotCommand {
  const body = (text ?? "").trim();
  if (!body) return null;
  if (/^(签到|簽到|checkin|check-in|check in|qd)$/i.test(body)) return { name: "checkin" };
  if (/^\d{6}$/.test(body)) return { name: "code", arg: body };
  const match = /^\/([a-z_]+)(?:@([A-Za-z0-9_]+))?(?:\s+([\s\S]*))?$/i.exec(body);
  if (!match) return null;
  const [, rawName, mention, rest = ""] = match;
  if (mention && botUsername && mention.toLowerCase() !== botUsername.toLowerCase()) return null;
  const arg = rest.trim();
  switch (rawName.toLowerCase()) {
    case "checkin":
    case "qd":
    case "signin":
      return { name: "checkin" };
    case "start":
      return { name: "start", arg };
    case "bind":
      return { name: "bind", arg };
    case "code":
      return { name: "code", arg };
    case "balance":
    case "me":
      return { name: "balance" };
    case "chatid":
      return { name: "chatid" };
    case "help":
      return { name: "help" };
    default:
      return null;
  }
}

/** Looks like an email address (the account is looked up by it; nothing more is checked here). */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}
