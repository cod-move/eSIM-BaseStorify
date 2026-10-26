import "server-only";

import { mongoose } from "@/lib/db";
import { EsimTopup, type IEsimTopup } from "@/models/esim-topup.model";

/**
 * A shopper's top-ups of one eSIM (TOP-06, the shopper's side), newest first.
 * The status they see folds the job state and its refund together.
 */

export type TopupDisplay = "paid" | "processing" | "completed" | "failed" | "refunded";

export interface TopupHistoryRow {
  id: string;
  orderNumber: string;
  name: string;
  priceMinor: number;
  status: TopupDisplay;
  createdAt: Date;
  completedAt: Date | null;
}

/** English fallbacks; pages translate by status (esim.topup.status.*). */
export const TOPUP_STATUS_TEXT: Record<TopupDisplay, string> = {
  paid: "Paid — being added",
  processing: "Being added",
  completed: "Added",
  failed: "Could not be added",
  refunded: "Refunded",
};

export function topupDisplay(topup: Pick<IEsimTopup, "state" | "refund">): TopupDisplay {
  if (topup.state === "completed") return "completed";
  if (topup.state === "failed") return topup.refund?.state === "done" ? "refunded" : "failed";
  return topup.state === "queued" ? "paid" : "processing";
}

export async function listEsimTopups(userId: string, esimId: string): Promise<TopupHistoryRow[]> {
  if (!mongoose.isValidObjectId(esimId) || !mongoose.isValidObjectId(userId)) return [];
  const rows = await EsimTopup.find({ esim: esimId, customer: userId })
    .sort({ createdAt: -1 })
    .limit(50)
    .select({ orderNumber: 1, name: 1, priceMinor: 1, state: 1, refund: 1, createdAt: 1, completedAt: 1 })
    .lean<IEsimTopup[]>();
  return rows.map((row) => ({
    id: String(row._id),
    orderNumber: row.orderNumber,
    name: row.name,
    priceMinor: row.priceMinor,
    status: topupDisplay(row),
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  }));
}
