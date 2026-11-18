import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { getTelegramSettings } from "@/models/esim-telegram.model";
import { createLinkToken, rewardsPage, unlinkTelegram } from "@/lib/esim/telegram/service";

/** The shopper's Telegram check-in rewards: the link, the balance, the history and what it buys. */
export const GET = withApi(
  { auth: "user", rateLimit: { action: "esim:telegram:read", preset: "browse" } },
  async ({ session }) => successResponse(await rewardsPage(session.user.id)),
);

/** A one-time start link that links this account in the bot (valid 15 minutes). */
export const POST = withApi(
  { auth: "user", rateLimit: { action: "esim:telegram:link", preset: "strict" } },
  async ({ session }) => {
    const settings = await getTelegramSettings();
    if (!settings.botUsername) throw new ValidationError("The Telegram bot is not set up yet");
    const token = await createLinkToken(session.user.id);
    return successResponse({ url: `https://t.me/${settings.botUsername}?start=${token}` });
  },
);

/** Unlinks the Telegram account; the data saved so far stays. */
export const DELETE = withApi(
  { auth: "user", rateLimit: { action: "esim:telegram:link", preset: "moderate" } },
  async ({ session }) => successResponse({ unlinked: await unlinkTelegram(session.user.id) }),
);
