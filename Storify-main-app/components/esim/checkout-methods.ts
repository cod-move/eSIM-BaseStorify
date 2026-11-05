import { Coins, CreditCard, Wallet, type LucideIcon } from "lucide-react";
import { EXTENSION, extensionChoice, isExtensionChoice, splitPaymentChoice, type ExtensionChoice } from "@/lib/esim/payments/method-names";

/**
 * The eSIM payment methods on Storify's checkout (patch P15): one row each,
 * beside the card and the store's other gateways, valued "extension:<code>".
 * Placing the order sends `paymentMethod: "extension"` with the code, and the
 * payment starts at once — no second choice on another page.
 */

export type { ExtensionChoice };
export { isExtensionChoice };

const ICONS: Record<string, LucideIcon> = { stripe: CreditCard, bepusdt: Coins };

export interface ExtensionOption {
  code: string;
  name: string;
}

/** One checkout row per method on offer, in the admin's order. */
export function esimExtensionRows(options: readonly ExtensionOption[] | undefined, detail: string) {
  return (options ?? []).map((option) => ({
    value: extensionChoice(option.code),
    label: option.name,
    icon: ICONS[option.code] ?? Wallet,
    detail,
  }));
}

/** What the order is placed with: Storify's method, plus the eSIM method when a row of one was chosen. */
export function esimPaymentFields<M extends string>(value: M | ExtensionChoice): { paymentMethod: M | typeof EXTENSION; extensionMethod?: string } {
  return splitPaymentChoice(value);
}

/** Storify's method for a row's value: "extension" for any eSIM method. */
export function esimBaseMethod<M extends string>(value: M | ExtensionChoice | undefined): M | typeof EXTENSION | undefined {
  return value === undefined ? undefined : splitPaymentChoice(value).paymentMethod;
}
