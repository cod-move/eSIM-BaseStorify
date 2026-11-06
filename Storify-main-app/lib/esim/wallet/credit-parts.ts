import { quantizeToCurrency } from "@/lib/intl/money";

/**
 * The shopper's one balance, told apart by where it came from (patch P38):
 * money they topped up (a wallet top-up, never expires), credit the store
 * gave them (it may expire), and refunds to credit. Spending takes from the
 * part that expires first, so the shopper loses nothing by having one
 * balance; the split is only shown. Pure.
 */

export type CreditKind = "topup" | "gift" | "refund";

export const CREDIT_KINDS: readonly CreditKind[] = ["topup", "gift", "refund"];

/** Which part a lot of credit belongs to, by its `source`. */
export function creditKind(source: string | undefined | null): CreditKind {
  if (source === "wallet_topup") return "topup";
  if (source === "return_refund" || source === "order_refund" || source === "order_refund_restore") return "refund";
  return "gift";
}

export interface CreditPart {
  kind: CreditKind;
  amount: number;
  /** What of it expires first, and when; null when none of it expires. */
  nextExpiry: { amount: number; expiresAt: string } | null;
}

type Lot = { source?: string | null; remaining?: number | null; expiresAt?: Date | string | null };

/** A currency's live lots, as parts: top-up, gift, refund, in that order, only those with something in them. */
export function partsOf(lots: readonly Lot[], currency: string): CreditPart[] {
  return CREDIT_KINDS.flatMap((kind): CreditPart[] => {
    const mine = lots.filter((lot) => creditKind(lot.source) === kind && Number(lot.remaining) > 0);
    const amount = quantizeToCurrency(mine.reduce((sum, lot) => sum + Number(lot.remaining || 0), 0), currency);
    if (!(amount > 0)) return [];
    const expiring = mine
      .filter((lot) => lot.expiresAt)
      .sort((a, b) => new Date(a.expiresAt!).getTime() - new Date(b.expiresAt!).getTime());
    const soonest = expiring[0] ? new Date(expiring[0].expiresAt!).toISOString() : null;
    const soonestAmount = soonest
      ? quantizeToCurrency(expiring.filter((lot) => new Date(lot.expiresAt!).toISOString() === soonest).reduce((sum, lot) => sum + Number(lot.remaining || 0), 0), currency)
      : 0;
    return [{ kind, amount, nextExpiry: soonest ? { amount: soonestAmount, expiresAt: soonest } : null }];
  });
}

/**
 * What a history row moved, by part: an issue is its own source's; a spend or
 * an expiry, the parts of the lots it took from (`lotSource`: lot id → source).
 */
export function rowKinds(
  row: { type: string; amount: number; source?: string | null; lots?: ReadonlyArray<{ lotId: unknown; amount: number }> | null },
  lotSource: ReadonlyMap<string, string>,
  currency: string,
): Array<{ kind: CreditKind; amount: number }> {
  if (row.type === "issue") return [{ kind: creditKind(row.source), amount: row.amount }];
  const byKind = new Map<CreditKind, number>();
  for (const lot of row.lots ?? []) {
    const source = lotSource.get(String(lot.lotId));
    if (source === undefined) continue;
    const kind = creditKind(source);
    byKind.set(kind, (byKind.get(kind) ?? 0) + Number(lot.amount || 0));
  }
  return CREDIT_KINDS.filter((kind) => byKind.has(kind)).map((kind) => ({ kind, amount: quantizeToCurrency(byKind.get(kind)!, currency) }));
}
