import "server-only";

/**
 * The check-in bot's own Telegram Bot API calls. It is a separate bot from
 * the one the store's chat inbox may use (lib/conversations): a bot has one
 * webhook, so the two cannot share. Its token and the webhook secret come
 * from .env (ESIM_TELEGRAM_BOT_TOKEN, ESIM_TELEGRAM_WEBHOOK_SECRET).
 */

const API = "https://api.telegram.org";

export function botToken(): string | null {
  return process.env.ESIM_TELEGRAM_BOT_TOKEN?.trim() || null;
}

export function webhookSecret(): string | null {
  return process.env.ESIM_TELEGRAM_WEBHOOK_SECRET?.trim() || null;
}

export class BotApiError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
  ) {
    super(message);
    this.name = "BotApiError";
  }
}

async function call<T>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const token = botToken();
  if (!token) throw new BotApiError("ESIM_TELEGRAM_BOT_TOKEN is not set", null);
  const response = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string; error_code?: number } | null;
  if (!payload?.ok) {
    // The token is in the URL only; the description Telegram returns never carries it.
    throw new BotApiError(payload?.description || `Telegram ${method} failed (${response.status})`, payload?.error_code ?? response.status);
  }
  return payload.result as T;
}

export async function getMe() {
  return call<{ id: number; username?: string; first_name: string; can_read_all_group_messages?: boolean }>("getMe");
}

export async function setWebhook(url: string, secret: string) {
  return call<boolean>("setWebhook", { url, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true });
}

export async function getWebhookInfo() {
  return call<{ url: string; pending_update_count: number; last_error_date?: number; last_error_message?: string }>("getWebhookInfo");
}

export async function setCommands(commands: Array<{ command: string; description: string }>, languageCode?: string) {
  return call<boolean>("setMyCommands", { commands, ...(languageCode ? { language_code: languageCode } : {}) });
}

/**
 * A reply in a chat; `replyTo` answers that message. Answers the sent
 * message's id, or null when it failed — failures are logged, never thrown:
 * a reply is a courtesy.
 */
export async function sendMessage(chatId: number | string, text: string, options: { replyTo?: number; html?: boolean } = {}): Promise<number | null> {
  try {
    const sent = await call<{ message_id: number }>("sendMessage", {
      chat_id: chatId,
      text,
      ...(options.html ? { parse_mode: "HTML" } : {}),
      link_preview_options: { is_disabled: true },
      ...(options.replyTo ? { reply_parameters: { message_id: options.replyTo, allow_sending_without_reply: true } } : {}),
    });
    return sent.message_id ?? null;
  } catch (error) {
    console.error("Telegram check-in bot: sendMessage failed:", (error as Error).message);
    return null;
  }
}

/**
 * Deletes messages in a chat (the bot must be a group admin allowed to
 * delete messages for anyone else's). Answers false when Telegram refused;
 * a message already gone counts as deleted.
 */
export async function deleteMessages(chatId: number | string, messageIds: number[]): Promise<boolean> {
  if (!messageIds.length) return true;
  try {
    await call<boolean>("deleteMessages", { chat_id: chatId, message_ids: messageIds.slice(0, 100) });
    return true;
  } catch (error) {
    const message = (error as Error).message;
    if (/message to delete not found|MESSAGE_ID_INVALID/i.test(message)) return true;
    console.error("Telegram check-in bot: deleteMessages failed:", message);
    return false;
  }
}
