import "server-only";

import { EsimTelegramDeletion } from "@/models/esim-telegram.model";
import { botToken, deleteMessages } from "@/lib/esim/telegram/bot-api";

/**
 * Keeping the rewards group tidy: a check-in and the bot's answer are
 * deleted a set number of minutes later. Each message waits in a queue (it
 * must outlive a deploy or a restart); the fulfilment cron, which runs every
 * minute, deletes what is due. The bot must be a group admin with "Delete
 * messages", or Telegram refuses; a refused message is tried a few times,
 * then left alone.
 */

const MAX_TRIES = 3;
const DAY_MS = 86_400_000;

/** Queues the messages for deletion `minutes` from now; 0 or less queues nothing. */
export async function scheduleDeletion(chatId: string, messageIds: Array<number | null | undefined>, minutes: number, now = Date.now()) {
  const ids = messageIds.filter((id): id is number => typeof id === "number" && id > 0);
  if (!(minutes > 0) || !ids.length) return;
  const deleteAt = new Date(now + minutes * 60_000);
  await EsimTelegramDeletion.bulkWrite(
    ids.map((messageId) => ({
      updateOne: {
        filter: { chatId, messageId },
        update: { $setOnInsert: { chatId, messageId, deleteAt, tries: 0, purgeAt: new Date(deleteAt.getTime() + DAY_MS) } },
        upsert: true,
      },
    })),
    { ordered: false },
  ).catch((error) => console.error("Telegram check-in bot: scheduling a deletion failed:", error));
}

/** Deletes the queued messages that are due, a chat at a time. Called by the fulfilment cron. */
export async function runTelegramDeletions(limit = 300, now = new Date()): Promise<{ deleted: number; failed: number }> {
  if (!botToken()) return { deleted: 0, failed: 0 };
  const due = await EsimTelegramDeletion.find({ deleteAt: { $lte: now }, tries: { $lt: MAX_TRIES } })
    .sort({ deleteAt: 1 })
    .limit(limit)
    .lean();
  if (!due.length) return { deleted: 0, failed: 0 };
  const byChat = new Map<string, typeof due>();
  for (const row of due) byChat.set(row.chatId, [...(byChat.get(row.chatId) ?? []), row]);
  let deleted = 0;
  let failed = 0;
  for (const [chatId, rows] of byChat) {
    // Telegram deletes up to 100 at once.
    for (let start = 0; start < rows.length; start += 100) {
      const batch = rows.slice(start, start + 100);
      const ids = batch.map((row) => row._id);
      if (await deleteMessages(chatId, batch.map((row) => row.messageId))) {
        await EsimTelegramDeletion.deleteMany({ _id: { $in: ids } });
        deleted += batch.length;
      } else {
        await EsimTelegramDeletion.updateMany({ _id: { $in: ids } }, { $inc: { tries: 1 }, $set: { deleteAt: new Date(now.getTime() + 60_000) } });
        failed += batch.length;
      }
    }
  }
  return { deleted, failed };
}
