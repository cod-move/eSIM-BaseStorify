import { randomInt } from "node:crypto";

/**
 * Online order numbers that say nothing about how many orders a store takes
 * (patch P39): the prefix, the day (YYMMDD, UTC) and six random digits,
 * "ORD261106482917". A sequence let anyone count the store's orders, and
 * guess other shoppers' numbers. In-store (POS) receipts keep their counter.
 */
export function randomOrderNumber(prefix: string, now = new Date(), random: (max: number) => number = randomInt): string {
  const day = now.toISOString().slice(2, 10).replace(/-/g, "");
  return `${prefix}${day}${String(random(1_000_000)).padStart(6, "0")}`;
}

/** A random number no order has yet; `taken` checks the orders. */
export async function freshOrderNumber(prefix: string, taken: (orderNumber: string) => Promise<boolean>): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const orderNumber = randomOrderNumber(prefix);
    if (!(await taken(orderNumber))) return orderNumber;
  }
  throw new Error("Could not find a free order number");
}
