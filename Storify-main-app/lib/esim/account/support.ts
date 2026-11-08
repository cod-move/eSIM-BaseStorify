import "server-only";

import { mongoose } from "@/lib/db";
import { Order } from "@/models";
import { listCustomerEsims } from "@/lib/esim/account/esims";
import { listCustomerNumbers } from "@/lib/esim/numbers/account";

/**
 * What a shopper can ask the store about from "Contact support": one of
 * their orders, eSIMs or numbers, or nothing in particular. There are no
 * tickets: the request is a message in the shopper's one thread with the
 * store (Storify's live chat), opened with the item named, so support sees
 * what it is about.
 */

export type SupportTopicKind = "order" | "esim" | "number";

export interface SupportTopic {
  kind: SupportTopicKind;
  id: string;
  /** What the shopper picks from: "#A1B2C3 · Japan 5 GB". */
  label: string;
  /** What the message names, for support: order number, ICCID, MSISDN. */
  reference: string;
}

const ORDERS = 50;

export async function listSupportTopics(userId: string): Promise<SupportTopic[]> {
  if (!mongoose.isValidObjectId(userId)) return [];
  const [orders, esims, numbers] = await Promise.all([
    Order.find({ customerId: new mongoose.Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(ORDERS)
      .select({ orderNumber: 1, createdAt: 1, "items.name": 1 })
      .lean<Array<{ _id: unknown; orderNumber: string; createdAt?: Date; items?: Array<{ name?: string }> }>>(),
    listCustomerEsims(userId),
    listCustomerNumbers(userId),
  ]);
  const day = (date?: Date) => (date ? new Date(date).toISOString().slice(0, 10) : "");
  return [
    ...orders.map((order) => {
      const names = (order.items ?? []).map((item) => item.name).filter(Boolean);
      const what = names.length ? `${names[0]}${names.length > 1 ? ` +${names.length - 1}` : ""}` : "";
      return { kind: "order" as const, id: String(order._id), label: [`#${order.orderNumber}`, day(order.createdAt), what].filter(Boolean).join(" · "), reference: `#${order.orderNumber}` };
    }),
    ...esims.map((esim) => ({
      kind: "esim" as const,
      id: esim.id,
      label: [esim.remark || esim.planName, esim.iccid ? `ICCID ${esim.iccid}` : null].filter(Boolean).join(" · "),
      reference: [esim.planName, esim.iccid ? `ICCID ${esim.iccid}` : null, esim.orderNumber ? `#${esim.orderNumber}` : null].filter(Boolean).join(", "),
    })),
    ...numbers.map((number) => ({
      kind: "number" as const,
      id: number.id,
      label: [`+${number.msisdn}`, number.remark].filter(Boolean).join(" · "),
      reference: `+${number.msisdn}`,
    })),
  ];
}
