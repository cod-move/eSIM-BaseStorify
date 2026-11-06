import { Order, getNextSequence } from "@/models";
import { normalizeOrderPrefix } from "@/lib/orders/order-settings";
import { freshOrderNumber } from "@/lib/esim/orders/order-number"; // [esim-patch] P39

const ONLINE_COUNTER_KEY_PREFIX = "online_order:";
const POS_COUNTER_KEY_PREFIX = "pos_order:";

/**
 * Read the highest existing order number for a prefix, comparing the numeric
 * suffix NUMERICALLY. A lexicographic sort would rank ORD999999 above
 * ORD1000000, so a counter re-seeded past a million orders would restart at
 * the wrong value and grind through duplicate-key retries. Runs only when a
 * counter document is first created for a prefix.
 */
async function readMaxOrderSequence(prefix: string): Promise<number> {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rows = (await Order.aggregate([
    { $match: { orderNumber: { $regex: `^${escaped}\\d+$` } } },
    {
      $project: {
        seq: {
          $toLong: {
            $substrCP: [
              "$orderNumber",
              prefix.length,
              {
                $subtract: [{ $strLenCP: "$orderNumber" }, prefix.length],
              },
            ],
          },
        },
      },
    },
    { $group: { _id: null, max: { $max: "$seq" } } },
  ])) as Array<{ max?: number }>;
  return Number(rows[0]?.max || 0);
}

/**
 * The next online order number. [esim-patch] P39: not a counter but the day
 * and six random digits, <PREFIX>261106482917 (lib/esim/orders/order-number.ts),
 * so a number tells nobody how many orders the store takes.
 */
export async function getNextOnlineOrderNumber(prefix = "ORD"): Promise<string> {
  const normalized = normalizeOrderPrefix(prefix);
  return freshOrderNumber(normalized, async (orderNumber) => Boolean(await Order.exists({ orderNumber }))); // [esim-patch] P39
}

/** Storify's sequence for online orders, kept for [esim-patch] P39's undo: <PREFIX>000001. */
export async function getNextSequentialOnlineOrderNumber(prefix = "ORD"): Promise<string> {
  const normalized = normalizeOrderPrefix(prefix);
  const seq = await getNextSequence(
    `${ONLINE_COUNTER_KEY_PREFIX}${normalized}`,
    () => readMaxOrderSequence(normalized),
  );
  return `${normalized}${String(seq).padStart(6, "0")}`;
}

/**
 * Generate the next POS order number atomically for the given prefix.
 * Format: <PREFIX>000001. On first call (no counter document yet), seeds
 * from max(existing prefix#).
 */
export async function getNextPosOrderNumber(prefix: string): Promise<string> {
  const normalized = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "POS";
  const seq = await getNextSequence(
    `${POS_COUNTER_KEY_PREFIX}${normalized}`,
    () => readMaxOrderSequence(normalized),
  );
  return `${normalized}${String(seq).padStart(6, "0")}`;
}
