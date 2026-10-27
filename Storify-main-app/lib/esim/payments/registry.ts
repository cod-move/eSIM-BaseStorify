import { bepusdtPlugin } from "./plugins/bepusdt";
import { fakePaymentPlugin } from "./plugins/fake";
import { redeepayPlugin } from "./plugins/redeepay";
import type { PaymentPlugin } from "./plugins/types";

/**
 * The payment methods the eSIM payment page can offer (PAY, patch P15), each
 * one plugin with its own settings. A new gateway is a new plugin and an
 * entry here; Storify's checkout is not touched again.
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
  bepusdt: {
    plugin: bepusdtPlugin,
    displayName: "USDT / USDC (BEpusdt)",
    defaults: { cryptos: "USDT,USDC", orderName: "eSIM Order", timeout: "1200" },
  },
  "redeepay-wechat": {
    plugin: redeepayPlugin,
    displayName: "WeChat Pay (RedeePay)",
    defaults: { pcRoute: "Native|Native|WeChat", h5Route: "Wallet|H5|WeChat", defaultCountry: "HK", subject: "eSIM Order" },
  },
  "redeepay-alipay": {
    plugin: redeepayPlugin,
    displayName: "Alipay (RedeePay)",
    defaults: { pcRoute: "Native|Native|Alipay", h5Route: "Wallet|H5|Alipay", defaultCountry: "HK", subject: "eSIM Order" },
  },
  "fake-pay": {
    plugin: fakePaymentPlugin,
    displayName: "Test payment",
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
