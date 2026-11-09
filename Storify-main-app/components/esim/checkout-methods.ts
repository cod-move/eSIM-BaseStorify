import { createElement, useEffect, useRef } from "react";
import { Coins, CreditCard, Wallet, type LucideIcon } from "lucide-react";
import { EXTENSION, extensionChoice, isExtensionChoice, splitPaymentChoice, type ExtensionChoice } from "@/lib/esim/payments/method-names";
import { arrangeMethods, isIconUrl, type CheckoutDisplay } from "@/lib/esim/payments/checkout-display";

/**
 * The eSIM payment methods on Storify's checkout (patch P15): one row each,
 * beside the card and the store's other gateways, valued "extension:<code>".
 * Placing the order sends `paymentMethod: "extension"` with the code, and the
 * payment starts at once — no second choice on another page.
 */

export type { CheckoutDisplay, ExtensionChoice };
export { isExtensionChoice };

const ICONS: Record<string, LucideIcon> = { stripe: CreditCard, airwallex: CreditCard, bepusdt: Coins };

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

/** One component per uploaded icon, made once: drawn where the row's own icon was. */
const imageIcons = new Map<string, LucideIcon>();
function imageIcon(url: string): LucideIcon {
  let icon = imageIcons.get(url);
  if (!icon) {
    const Icon = () => createElement("img", { src: url, alt: "", "aria-hidden": true, className: "h-5 w-7 shrink-0 object-contain" });
    Icon.displayName = "EsimPaymentIcon";
    icon = Icon as unknown as LucideIcon;
    imageIcons.set(url, icon);
  }
  return icon;
}

/**
 * The checkout's payment rows as the admin set them (patch P34): in their
 * order, the account balance first, and with each uploaded icon.
 */
export function esimArrangeMethods<T extends { value: string; icon: LucideIcon }>(rows: T[], display: CheckoutDisplay | undefined): T[] {
  if (!display) return rows;
  return arrangeMethods(rows, display).map((row) => {
    const url = display.icons[row.value];
    return isIconUrl(url) ? { ...row, icon: imageIcon(url) } : row;
  });
}

/**
 * Chooses the admin's default method once, when checkout has its methods —
 * if it can take this order, and unless the balance (which covers it) is
 * chosen. The shopper's own choice after that is left alone.
 */
export function useEsimDefaultPaymentMethod(options: {
  display: CheckoutDisplay | undefined;
  selectable: readonly { value: string }[];
  current: () => string | undefined;
  choose: (value: string) => void;
}) {
  const { display, selectable, current, choose } = options;
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current || !display || selectable.length === 0) return;
    applied.current = true;
    const wanted = display.defaultMethod;
    if (!wanted || current() === "store_credit") return;
    if (selectable.some((method) => method.value === wanted)) choose(wanted);
  }, [display, selectable, current, choose]);
}
