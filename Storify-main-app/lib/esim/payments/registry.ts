import { EXTENSION_METHOD_NAMES } from "./method-names";
import { airwallexPlugin } from "./plugins/airwallex";
import { bepusdtPlugin } from "./plugins/bepusdt";
import { fakePaymentPlugin } from "./plugins/fake";
import { redeepayPlugin } from "./plugins/redeepay";
import { stripePlugin } from "./plugins/stripe";
import type { PaymentPlugin } from "./plugins/types";

/**
 * The eSIM payment methods (PAY, patch P15), each one plugin with its own
 * settings; checkout lists each on its own row. A new gateway is a new
 * plugin, an entry here and its name in method-names.ts; Storify's checkout
 * is not touched again.
 *
 * `defaults` fills credentials an admin has not set — the RedeePay entries
 * differ only in their routes, as they did in the old store.
 */
export interface PaymentMethodDefinition {
  plugin: PaymentPlugin;
  displayName: string;
  defaults: Record<string, string>;
  /** Hidden from the admin list and refused in production. */
  devOnly?: boolean;
}

export const PAYMENT_METHOD_DEFINITIONS = {
  stripe: {
    plugin: stripePlugin,
    displayName: EXTENSION_METHOD_NAMES.stripe,
    defaults: { threeDSecure: "any" },
  },
  airwallex: {
    plugin: airwallexPlugin,
    displayName: EXTENSION_METHOD_NAMES.airwallex,
    defaults: { env: "prod" },
  },
  bepusdt: {
    plugin: bepusdtPlugin,
    displayName: EXTENSION_METHOD_NAMES.bepusdt,
    defaults: { cryptos: "USDT,USDC", orderName: "eSIM Order", timeout: "1200" },
  },
  "redeepay-wechat": {
    plugin: redeepayPlugin,
    displayName: EXTENSION_METHOD_NAMES["redeepay-wechat"],
    defaults: { pcRoute: "Native|Native|WeChat", h5Route: "Wallet|H5|WeChat", defaultCountry: "HK", subject: "eSIM Order" },
  },
  "redeepay-alipay": {
    plugin: redeepayPlugin,
    displayName: EXTENSION_METHOD_NAMES["redeepay-alipay"],
    defaults: { pcRoute: "Native|Native|Alipay", h5Route: "Wallet|H5|Alipay", defaultCountry: "HK", subject: "eSIM Order" },
  },
  "fake-pay": {
    plugin: fakePaymentPlugin,
    displayName: EXTENSION_METHOD_NAMES["fake-pay"],
    defaults: {},
    devOnly: true,
  },
} satisfies Record<string, PaymentMethodDefinition>;

export type PaymentMethodCode = keyof typeof PAYMENT_METHOD_DEFINITIONS;

export function isPaymentMethodCode(code: string): code is PaymentMethodCode {
  return Object.hasOwn(PAYMENT_METHOD_DEFINITIONS, code);
}

export function paymentMethodDefinition(code: string): PaymentMethodDefinition | null {
  if (!isPaymentMethodCode(code)) return null;
  const definition: PaymentMethodDefinition = PAYMENT_METHOD_DEFINITIONS[code];
  if (definition.devOnly && process.env.NODE_ENV === "production") return null;
  return definition;
}
