import "server-only";

import { mongoose } from "@/lib/db";
import { LEDGER_ACCOUNT, LEDGER_BOOK } from "@/lib/finance/accounts";
import { postLedgerEntries, postingKey } from "@/lib/finance/ledger";
import { LEDGER_SOURCE_KIND } from "@/models/ledger-entry.model";

/**
 * What eSIMs cost the store, in Storify's books (ORD-12, patch P20).
 *
 * Suppliers are paid in advance: topping up a supplier is entered by hand
 * (Finance → adjustment: debit "eSIM supplier balance", credit the bank).
 * Each eSIM or top-up issued then draws that balance down at the USD cost
 * recorded when it was bought (the sale snapshot, ORD-04):
 *
 *   Dr Cost of goods / Cr eSIM supplier balance
 *
 * and an eSIM cancelled at the supplier gives it back. A cost not known in
 * USD (no rate at the time) is not posted: an unknown cost is not a zero one.
 * Each entry has a fixed key, so posting again changes nothing.
 */

type Id = mongoose.Types.ObjectId;

interface CostEvent {
  orderId: Id;
  orderNumber: string;
  /** The eSIM or top-up the cost belongs to; part of the entry's key. */
  unitId: Id;
  kind: "esim" | "topup";
  costUsdMinor: number | null | undefined;
  at: Date;
}

const STORE_CURRENCY = "USD";

export async function postEsimCost(event: CostEvent): Promise<boolean> {
  if (!(typeof event.costUsdMinor === "number" && event.costUsdMinor > 0)) return false;
  const written = await postLedgerEntries([
    {
      date: event.at,
      book: LEDGER_BOOK.OWN,
      debit: LEDGER_ACCOUNT.COST_OF_GOODS,
      credit: LEDGER_ACCOUNT.ESIM_SUPPLIER_PREPAID,
      amount: event.costUsdMinor / 100,
      currency: STORE_CURRENCY,
      source: { kind: LEDGER_SOURCE_KIND.ORDER, id: event.orderId, ref: event.orderNumber },
      key: postingKey(LEDGER_SOURCE_KIND.ORDER, event.orderId, `esim-${event.kind}-cost`, String(event.unitId)),
      note: event.kind === "esim" ? "eSIM bought from the supplier" : "eSIM top-up bought from the supplier",
    },
  ]);
  return written > 0;
}

/** The supplier took a cancelled eSIM back: its cost returns to the supplier balance. */
export async function reverseEsimCost(event: CostEvent): Promise<boolean> {
  if (!(typeof event.costUsdMinor === "number" && event.costUsdMinor > 0)) return false;
  const written = await postLedgerEntries([
    {
      date: event.at,
      book: LEDGER_BOOK.OWN,
      debit: LEDGER_ACCOUNT.ESIM_SUPPLIER_PREPAID,
      credit: LEDGER_ACCOUNT.COST_OF_GOODS,
      amount: event.costUsdMinor / 100,
      currency: STORE_CURRENCY,
      source: { kind: LEDGER_SOURCE_KIND.ORDER, id: event.orderId, ref: event.orderNumber },
      key: postingKey(LEDGER_SOURCE_KIND.ORDER, event.orderId, `esim-${event.kind}-cost-reversed`, String(event.unitId)),
      note: "eSIM cancelled at the supplier",
    },
  ]);
  return written > 0;
}
