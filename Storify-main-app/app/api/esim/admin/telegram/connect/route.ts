import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { ValidationError } from "@/lib/api/errors";
import { appBaseUrl } from "@/lib/app-url";
import { EsimTelegramSettings } from "@/models/esim-telegram.model";
import { ESIM_READ, ESIM_WRITE, auditEsim } from "@/lib/esim/admin/route";
import { BotApiError, botToken, getMe, getWebhookInfo, setCommands, setWebhook, webhookSecret } from "@/lib/esim/telegram/bot-api";

const webhookUrl = () => `${appBaseUrl().replace(/\/$/, "")}/api/esim/telegram/webhook`;

/** The bot as Telegram sees it: whether the token and secret are set, its name, and where its webhook points. */
export const GET = withApi(ESIM_READ, async () => {
  if (!botToken() || !webhookSecret()) {
    return successResponse({ configured: false, expectedUrl: webhookUrl() });
  }
  try {
    const [me, hook] = await Promise.all([getMe(), getWebhookInfo()]);
    return successResponse({
      configured: true,
      username: me.username ?? null,
      readsAllMessages: Boolean(me.can_read_all_group_messages),
      webhookUrl: hook.url || null,
      expectedUrl: webhookUrl(),
      pending: hook.pending_update_count,
      lastError: hook.last_error_message ?? null,
      lastErrorAt: hook.last_error_date ? new Date(hook.last_error_date * 1000).toISOString() : null,
    });
  } catch (error) {
    return successResponse({ configured: true, error: (error as Error).message, expectedUrl: webhookUrl() });
  }
});

/** Points the bot's webhook at this site, sets its command menu and remembers its @username. */
export const POST = withApi(ESIM_WRITE, async ({ request, session }) => {
  const secret = webhookSecret();
  if (!botToken() || !secret) {
    throw new ValidationError("Set ESIM_TELEGRAM_BOT_TOKEN and ESIM_TELEGRAM_WEBHOOK_SECRET in .env first, then restart the site.");
  }
  try {
    const me = await getMe();
    await setWebhook(webhookUrl(), secret);
    await setCommands([
      { command: "checkin", description: "Daily check-in for free data" },
      { command: "balance", description: "Data saved so far" },
      { command: "bind", description: "Link your account by email" },
      { command: "help", description: "How it works" },
    ]);
    await setCommands(
      [
        { command: "checkin", description: "每日签到领流量" },
        { command: "balance", description: "查看已攒流量" },
        { command: "bind", description: "用邮箱绑定账号" },
        { command: "help", description: "使用说明" },
      ],
      "zh",
    );
    await EsimTelegramSettings.updateOne({ key: "default" }, { $set: { botUsername: me.username ?? null } }, { upsert: true });
    await auditEsim(request, session, {
      resourceId: "esim:telegram",
      resourceName: "eSIM Telegram check-in",
      summary: `Connected the Telegram bot @${me.username ?? me.id}`,
    });
    return successResponse({ username: me.username ?? null, webhookUrl: webhookUrl() });
  } catch (error) {
    if (error instanceof BotApiError) throw new ValidationError(`Telegram: ${error.message}`);
    throw error;
  }
});
