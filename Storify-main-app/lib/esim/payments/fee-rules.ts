/**
 * Payment fees: what a checkout method adds on top of the order, a fixed
 * amount plus a percent of the goods, set per method on Admin → eSIM →
 * Payments. Amounts in cents. Pure.
 *
 * The balance ("store_credit") never carries a fee, and neither does a wallet
 * top-up, which has a fee of its own (WAL-01).
 */

/** The checkout methods a fee can be set for, as the checkout names them. */
export const PAYMENT_FEE_METHODS = [
  { method: "card", label: "Card" },
  { method: "paypal", label: "PayPal" },
  { method: "razorpay", label: "Razorpay" },
  { method: "paystack", label: "Paystack" },
  { method: "pesapal", label: "Pesapal" },
  { method: "iotec", label: "ioTec Pay" },
  { method: "orange_money", label: "Orange Money" },
  { method: "mtn_momo", label: "MTN Mobile Money" },
  { method: "extension", label: "More ways to pay" },
  { method: "cod", label: "Cash on delivery" },
] as const;

export type PaymentFeeMethod = (typeof PAYMENT_FEE_METHODS)[number]["method"];

export interface PaymentFeeRule {
  method: string;
  /** Cents. */
  fixedMinor: number;
  /** Of the goods, 0–20. */
  percent: number;
}

export const MAX_FEE_PERCENT = 20;

/** The rule for a method, or null when it charges nothing. */
export function feeRuleFor(rules: readonly PaymentFeeRule[] | null | undefined, method: string | null | undefined): PaymentFeeRule | null {
  if (!method || method === "store_credit") return null;
  const rule = (rules ?? []).find((entry) => entry.method === method);
  return rule && (rule.fixedMinor > 0 || rule.percent > 0) ? rule : null;
}

/** The fee on goods worth `baseMinor`: the percent, rounded to the cent, plus the fixed part. Nothing on nothing. */
export function paymentFeeMinor(rule: PaymentFeeRule | null, baseMinor: number): number {
  if (!rule || !(baseMinor > 0)) return 0;
  const percent = Math.min(Math.max(rule.percent, 0), MAX_FEE_PERCENT);
  return Math.round((baseMinor * percent) / 100) + Math.max(0, Math.round(rule.fixedMinor));
}

/** How the method is named on the fee line. */
export function paymentFeeLabel(method: string): string {
  return PAYMENT_FEE_METHODS.find((entry) => entry.method === method)?.label ?? method;
}
