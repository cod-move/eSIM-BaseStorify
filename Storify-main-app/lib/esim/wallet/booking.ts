/**
 * Wallet top-ups (WAL-01): the fee, and how much of a paid top-up line
 * becomes the shopper's balance. Pure — the ledger (lib/finance/postings.ts,
 * patch P19), the refund ceiling (P19) and the credit given on payment all
 * read the credited amount from `walletCreditOf`, so they can never disagree.
 *
 * A top-up line carries `lineAttributes.wallet` (the amount to add, in
 * cents) and `walletFee` (the fee, in cents); the line is charged both. Of
 * what the order actually took for its goods — after any coupon — the share
 * that is the top-up's amount becomes balance; the rest, the fee, is the
 * store's income.
 */

export interface WalletFeeSettings {
  feeFixedMinor: number;
  feePercent: number;
}

/** The fee on an amount, rounded up to the cent so the store never under-charges it. */
export function walletFeeMinor(amountMinor: number, settings: WalletFeeSettings): number {
  const percent = Math.max(0, settings.feePercent);
  const fixed = Math.max(0, Math.round(settings.feeFixedMinor));
  return fixed + Math.ceil((amountMinor * percent) / 100 - 1e-9);
}

export interface WalletLineAttributes {
  wallet: number;
  walletFee: number;
}

type Line = { price?: number | null; quantity?: number | null; lineAttributes?: unknown };

export function walletAttributesOf(line: { lineAttributes?: unknown }): WalletLineAttributes | null {
  const attributes = line.lineAttributes;
  if (!attributes || typeof attributes !== "object") return null;
  const { wallet, walletFee } = attributes as { wallet?: unknown; walletFee?: unknown };
  if (typeof wallet !== "number" || !Number.isInteger(wallet) || wallet <= 0) return null;
  return { wallet, walletFee: typeof walletFee === "number" && walletFee >= 0 ? Math.round(walletFee) : 0 };
}

const units = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The balance a paid order's top-up lines give, in the order's currency units.
 *
 * `merchandise` is what the order took for its goods after every discount —
 * the ledger passes the consignment's share; elsewhere it is `total − tax −
 * shipping − duty`. The top-up amounts' share of it, never more than the
 * amounts themselves. Zero for an order without top-up lines.
 */
export function walletCreditOf(items: readonly Line[] | null | undefined, merchandise: number): number {
  let amount = 0;
  let gross = 0;
  for (const item of items ?? []) {
    const quantity = Math.max(1, units(item.quantity) || 1);
    gross += units(item.price) * quantity;
    const wallet = walletAttributesOf(item);
    if (wallet) amount += (wallet.wallet / 100) * quantity;
  }
  if (!(amount > 0) || !(gross > 0) || !(merchandise > 0)) return 0;
  const share = Math.min(amount, (merchandise * amount) / gross);
  return Math.floor(share * 100 + 1e-6) / 100;
}

/** `walletCreditOf` for a whole order, with its goods taken as total − tax − shipping − duty. */
export function walletCreditOfOrder(order: {
  items?: readonly Line[] | null;
  total?: number | null;
  tax?: number | null;
  shippingCost?: number | null;
  customs?: { dutyAmount?: number | null } | null;
}): number {
  const merchandise = units(order.total) - units(order.tax) - Math.max(0, units(order.shippingCost)) - Math.max(0, units(order.customs?.dutyAmount));
  return walletCreditOf(order.items, Math.max(0, merchandise));
}
