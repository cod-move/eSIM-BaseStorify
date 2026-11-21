import "server-only";

import { timingSafeEqual } from "node:crypto";
import { appBaseUrl } from "@/lib/app-url";
import { getTelegramSettings } from "@/models/esim-telegram.model";
import { sendMessage, webhookSecret } from "@/lib/esim/telegram/bot-api";
import { scheduleDeletion } from "@/lib/esim/telegram/deletions";
import { formatMb, looksLikeEmail, parseCommand } from "@/lib/esim/telegram/rules";
import {
  checkIn,
  consumeLinkToken,
  linkOfTelegramUser,
  requestEmailCode,
  rewardAccountOf,
  verifyEmailCode,
  type TelegramSender,
} from "@/lib/esim/telegram/service";
import { botLanguage, words } from "@/lib/esim/telegram/words";

/**
 * One update from Telegram for the check-in bot. In a rewards group: the
 * check-in (and /chatid, so the admin can find the group's ID). In a private
 * chat: linking (the website's start link, or /bind email and its code), the
 * balance, help. Anything else is ignored. Replies are best effort; the
 * webhook always answers 200 so Telegram does not resend.
 */

/** The secret Telegram sends with every update, compared in constant time. */
export function isGenuineUpdate(header: string | null): boolean {
  const secret = webhookSecret();
  if (!secret || !header) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface TelegramMessage {
  message_id: number;
  text?: string;
  chat: { id: number; type: "private" | "group" | "supergroup" | "channel" };
  from?: { id: number; is_bot?: boolean; username?: string; first_name?: string; language_code?: string };
}

/** "@name", else the first name, as the group reply addresses someone. */
function nameOf(sender: TelegramSender) {
  return sender.username ? `@${sender.username}` : sender.firstName || "";
}

export async function handleTelegramUpdate(update: unknown): Promise<void> {
  const message = (update as { message?: TelegramMessage } | null)?.message;
  if (!message?.from || message.from.is_bot || !message.text) return;
  const settings = await getTelegramSettings();
  const command = parseCommand(message.text, settings.botUsername);
  if (!command) return;

  const sender: TelegramSender = {
    id: String(message.from.id),
    username: message.from.username ?? null,
    firstName: message.from.first_name ?? null,
    languageCode: message.from.language_code ?? null,
  };
  const say = words(botLanguage(sender.languageCode));
  const chatId = String(message.chat.id);
  const isPrivate = message.chat.type === "private";
  const send = (text: string) => sendMessage(message.chat.id, text, { replyTo: isPrivate ? undefined : message.message_id });
  const reply = async (text: string): Promise<void> => {
    await send(text);
  };
  /** A check-in answer in the group: it and the shopper's message go after the minutes the admin set. */
  const answerCheckin = async (text: string): Promise<void> => {
    const sent = await send(text);
    await scheduleDeletion(chatId, [message.message_id, sent], settings.deleteAfterMinutes ?? 0);
  };
  const site = appBaseUrl().replace(/\/$/, "");
  const bot = settings.botUsername ?? "";

  switch (command.name) {
    case "chatid":
      // Anyone may ask; a group's ID is not a secret, and the admin needs it for the settings.
      return reply(say.chatId(chatId));

    case "checkin": {
      if (isPrivate) return settings.enabled ? reply(say.groupOnly) : reply(say.disabled);
      // A group that is not a rewards group: stay quiet rather than answer every "签到".
      if (!settings.groupIds.includes(chatId)) return;
      const result = await checkIn(sender, chatId);
      switch (result.status) {
        case "ok":
          return answerCheckin(
            say.checkedIn(nameOf(sender), formatMb(result.mb), formatMb(result.balanceMb)) +
              // Said only once the limit is reached by this check-in.
              (result.limit && result.limit.usedMb >= result.limit.capMb
                ? say.limitFull(result.limit.period, formatMb(result.limit.capMb), site)
                : ""),
          );
        case "limit":
          return answerCheckin(say.limitReached(nameOf(sender), result.limit.period, formatMb(result.limit.capMb), site));
        case "already":
          return answerCheckin(say.already(nameOf(sender), formatMb(result.balanceMb)));
        case "cap":
          return answerCheckin(say.capReached);
        case "not_linked":
          return answerCheckin(say.notLinked(nameOf(sender), bot));
        case "disabled":
          return answerCheckin(say.disabled);
        default:
          return;
      }
    }

    case "start": {
      if (!isPrivate) return;
      if (command.arg) {
        const email = await consumeLinkToken(command.arg, sender);
        return reply(email ? say.linked(email, settings.groupLink ?? null) : say.linkExpired);
      }
      return reply(say.help(bot, site));
    }

    case "help":
      return isPrivate ? reply(say.help(bot, site)) : undefined;

    case "bind": {
      if (!isPrivate) return reply(say.bindPrivate);
      if (!looksLikeEmail(command.arg)) return reply(say.bindUsage);
      const result = await requestEmailCode(sender, command.arg, botLanguage(sender.languageCode));
      return reply(result === "too_many" ? say.codeTooMany : say.codeSent);
    }

    case "code": {
      if (!isPrivate) return;
      const result = await verifyEmailCode(sender, command.arg);
      if (result.ok) return reply(say.linked(result.email, settings.groupLink ?? null));
      return reply(result.reason === "wrong" ? say.codeWrong : say.codeExpired);
    }

    case "balance": {
      const linked = await linkOfTelegramUser(sender.id);
      if (!linked) return reply(say.balanceNone);
      const account = await rewardAccountOf(String(linked.user));
      return reply(say.balance(formatMb(account.balanceMb), account.checkins, site));
    }
  }
}
