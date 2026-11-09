import "server-only";

import { mongoose } from "@/lib/db";
import { User } from "@/models";
import { EsimNumber } from "@/models/esim-number.model";
import { getSettingsLean } from "@/models/settings.model";
import { DEFAULT_STORE_NAME } from "@/config/branding.config";
import { credentialsOf, findProvider } from "@/lib/esim/provider-service";
import { topConnectClient } from "@/lib/esim/providers/registry";
import { statementMonths, type StatementMonth } from "@/lib/esim/numbers/service-policy";
import type { TopConnectCallRecord, TopConnectDataRecord, TopConnectRecharge } from "@/lib/esim/providers/topconnect";

/**
 * A number's phone bill for whole past months, from TopConnect's records:
 * per month the calls, texts, data sessions and money put on the card, with
 * totals. The PDF is lib/esim/numbers/statement-pdf.tsx.
 */

export interface StatementMonthData extends StatementMonth {
  calls: TopConnectCallRecord[];
  data: TopConnectDataRecord[];
  recharges: TopConnectRecharge[];
}

export interface StatementData {
  storeName: string;
  customer: { name: string | null; email: string | null };
  msisdn: string;
  iccid: string;
  currency: string;
  createdAt: string;
  months: StatementMonthData[];
}

export type StatementResult = { ok: true; data: StatementData } | { ok: false; message: string };

/** Null when the number is not the shopper's. */
export async function numberStatement(userId: string, numberId: string, range: { from: string; to: string }): Promise<StatementResult | null> {
  if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(numberId)) return null;
  const row = await EsimNumber.findOne({ _id: numberId, customer: new mongoose.Types.ObjectId(userId), status: "sold" })
    .select({ msisdn: 1, iccid: 1, card: 1 })
    .lean();
  if (!row) return null;
  const months = statementMonths(range.from, range.to, new Date());
  if (typeof months === "string") return { ok: false, message: months };
  const provider = await findProvider("topconnect");
  if (!provider || provider.status !== "active") return { ok: false, message: "Phone bills are not available right now" };
  const client = topConnectClient(credentialsOf(provider));

  const filled: StatementMonthData[] = [];
  try {
    // One month at a time: TopConnect answers a month's records quickly.
    for (const month of months) {
      const [calls, data, recharges] = await Promise.all([
        client.callRecords(row.msisdn, month.from, month.to),
        client.dataRecords(row.msisdn, month.from, month.to),
        client.recharges(row.msisdn, month.from, month.to),
      ]);
      // Oldest first on a bill.
      const oldest = <T extends { at: string | null }>(list: T[]) => [...list].reverse();
      filled.push({ ...month, calls: oldest(calls), data: oldest(data), recharges: oldest(recharges) });
    }
  } catch {
    return { ok: false, message: "The network's records could not be read; try again in a moment" };
  }

  const [user, settings] = await Promise.all([
    User.findById(userId).select({ name: 1, email: 1 }).lean<{ name?: string; email?: string } | null>(),
    getSettingsLean().catch(() => null),
  ]);
  return {
    ok: true,
    data: {
      storeName: settings?.general?.storeName || DEFAULT_STORE_NAME,
      customer: { name: user?.name ?? null, email: user?.email ?? null },
      msisdn: row.msisdn,
      iccid: row.iccid,
      currency: (row.card?.currency ?? "EUR").toUpperCase(),
      createdAt: new Date().toISOString(),
      months: filled,
    },
  };
}
