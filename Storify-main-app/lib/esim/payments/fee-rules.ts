/**
 * Payment fees: what a checkout method adds on top of the order, a fixed
 * amount plus a percent of the goods, set per method on Admin → eSIM →
 * Payments. Amounts in cents. Pure.
 *
 * The balance ("store_credit") never carries a fee, and neither does a wallet
 * top-up, which has a fee of its own (WAL-01). Each eSIM payment method has
 * its own fee, under "extension:<code>" (method-names.ts).
 */

import { DEV_ONLY_METHODS, EXTENSION_METHOD_NAMES, extensionChoice, STORE_CHECKOUT_METHODS } from "./method-names";

/**
 * The checkout methods a fee can be set for, as the checkout names them:
 * Storify's, then each eSIM payment method, then "extension" without one —
 * the shopper app, whose shopper picks on the eSIM payment page.
 */
export const PAYMENT_FEE_METHODS: ReadonlyArray<{ method: string; label: string }> = [
  ...STORE_CHECKOUT_METHODS,
  ...Object.entries(EXTENSION_METHOD_NAMES)
    // The test method has a fee only outside production, to try fees with.
    .filter(([code]) => process.env.NODE_ENV !== "production" || !DEV_ONLY_METHODS.includes(code))
    .map(([code, label]) => ({ method: extensionChoice(code), label })),
  { method: "extension", label: "eSIM payment page (shopper app)" },
];

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
