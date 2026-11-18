import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { handleTelegramUpdate, isGenuineUpdate } from "@/lib/esim/telegram/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The Telegram check-in bot's webhook (lib/esim/telegram). Telegram proves an
 * update is genuine only by the secret given to setWebhook
 * (ESIM_TELEGRAM_WEBHOOK_SECRET). A handled update — or one that failed while
 * being handled — answers 200, so Telegram does not send it again and again;
 * the ledger's keys make a resent check-in count once anyway.
 */
export async function POST(request: NextRequest) {
  if (!isGenuineUpdate(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  try {
    await connectDB();
    await handleTelegramUpdate(update);
  } catch (error) {
    console.error("Telegram check-in bot: update failed:", error);
  }
  return NextResponse.json({ ok: true });
}
