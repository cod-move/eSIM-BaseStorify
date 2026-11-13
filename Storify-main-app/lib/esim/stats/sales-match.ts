/**
 * Which orders are sales (patch P71). A wallet top-up (WAL-01) is checked out
 * as an order of its own, but the money is the shopper's balance kept for
 * them, not something sold: it becomes a sale when they spend it, on the
 * order that spends it. Counted as well at the top-up, the same money was
 * two orders and twice the sales on the dashboard and the analytics page.
 *
 * A top-up order carries only top-up lines (lib/esim/cart: a top-up is
 * checked out on its own), each with `lineAttributes.wallet`; no other line
 * has it. This is a query condition to spread into an order `$match`: no line
 * of the order is a top-up. The finance ledger already books a top-up as
 * balance owed (patch P19) and is left as it is; so are order lists, where a
 * top-up order is still shown.
 */
export const NOT_WALLET_TOPUP_ORDER: Record<string, unknown> = {
  "items.lineAttributes.wallet": { $exists: false },
};
