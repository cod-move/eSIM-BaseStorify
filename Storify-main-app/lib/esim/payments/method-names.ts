/**
 * The eSIM payment methods by code, and how checkout names one of them (PAY,
 * patch P15). Pure; safe in the browser.
 *
 * Storify knows one gateway, "extension". Checkout lists each method on its
 * own row as "extension:<code>" and sends it as `paymentMethod: "extension"`
 * plus `extensionMethod: "<code>"`. A fee is set per method under the same
 * "extension:<code>" key; plain "extension" is a checkout that chose no
 * method there (the shopper app), which picks one on the eSIM payment page.
 */

/** The default names; an admin can rename a method under eSIM → Payments. */
export const EXTENSION_METHOD_NAMES = {
  stripe: "Alipay, WeChat Pay and more (Stripe)",
  airwallex: "Card, Apple Pay, Google Pay and more (Airwallex)",
  bepusdt: "USDT / USDC (BEpusdt)",
  "redeepay-wechat": "WeChat Pay (RedeePay)",
  "redeepay-alipay": "Alipay (RedeePay)",
  "fake-pay": "Test payment",
} as const;

/** Storify's own checkout methods, by the value checkout gives them, with their names. */
export const STORE_CHECKOUT_METHODS: ReadonlyArray<{ method: string; label: string }> = [
  { method: "card", label: "Card" },
  { method: "paypal", label: "PayPal" },
  { method: "razorpay", label: "Razorpay" },
  { method: "paystack", label: "Paystack" },
  { method: "pesapal", label: "Pesapal" },
  { method: "iotec", label: "ioTec Pay" },
  { method: "orange_money", label: "Orange Money" },
  { method: "mtn_momo", label: "MTN Mobile Money" },
  { method: "cod", label: "Cash on delivery" },
];

/** Only for development: no fee is set for it and it is never offered in production. */
export const DEV_ONLY_METHODS: readonly string[] = ["fake-pay"];

export const EXTENSION = "extension";
const PREFIX = "extension:";
const CODE = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** A checkout row's value for one method: "extension:<code>". */
export type ExtensionChoice = `extension:${string}`;

export const extensionChoice = (code: string): ExtensionChoice => `${PREFIX}${code}`;

export function isExtensionChoice(value: unknown): value is ExtensionChoice {
  return typeof value === "string" && value.startsWith(PREFIX) && CODE.test(value.slice(PREFIX.length));
}

export const isExtensionMethodCode = (value: unknown): value is string => typeof value === "string" && CODE.test(value);

/** A checkout row's value as Storify's method plus the eSIM method, if it is one. */
export function splitPaymentChoice<M extends string>(value: M | ExtensionChoice): { paymentMethod: M | typeof EXTENSION; extensionMethod?: string } {
  if (isExtensionChoice(value)) return { paymentMethod: EXTENSION, extensionMethod: value.slice(PREFIX.length) };
  return { paymentMethod: value as M };
}

/** The key a payment fee is set under: "extension:<code>" for a chosen eSIM method, else the method. */
export function feeMethodOf(paymentMethod: string, extensionMethod?: string | null): string {
  return paymentMethod === EXTENSION && extensionMethod && isExtensionMethodCode(extensionMethod) ? extensionChoice(extensionMethod) : paymentMethod;
}

export function extensionMethodName(code: string): string {
  return (EXTENSION_METHOD_NAMES as Record<string, string>)[code] ?? code;
}
