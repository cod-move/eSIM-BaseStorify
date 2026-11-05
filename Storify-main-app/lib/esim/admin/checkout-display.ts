import "server-only";

import * as z from "zod";
import { connectDB } from "@/lib/db";
import { getSettings } from "@/models/settings.model";
import { getEsimSettings } from "@/models/esim-pricing.model";
import { EMPTY_CHECKOUT_DISPLAY, arrangeMethods, isIconUrl, type CheckoutDisplay } from "@/lib/esim/payments/checkout-display";
import { extensionChoice, STORE_CHECKOUT_METHODS } from "@/lib/esim/payments/method-names";
import { listAdminPaymentMethods } from "@/lib/esim/admin/payments";

/**
 * How checkout lists its payment methods (patch P34), set on Storify's payment
 * settings page beside the gateways: the order, the method chosen to begin
 * with, and an uploaded icon each.
 */

/** Where Storify keeps each of its methods' switch (`settings.payment.<key>.enabled`). */
const STORE_SWITCH: Record<string, string> = {
  card: "stripe",
  paypal: "paypal",
  razorpay: "razorpay",
  paystack: "paystack",
  pesapal: "pesapal",
  iotec: "iotec",
  orange_money: "orange_money",
  mtn_momo: "mtn_momo",
  cod: "cod",
};

export interface CheckoutMethodRow {
  method: string;
  label: string;
  /** Switched on (Storify's switch, or the eSIM method's status): only these can show at checkout. */
  on: boolean;
  /** An eSIM payment method rather than one of Storify's. */
  esim: boolean;
}

/** Every method checkout can show, Storify's then the eSIM ones, with their names and switches. */
async function knownMethods(): Promise<CheckoutMethodRow[]> {
  const settings = (await getSettings()) as unknown as { payment?: Record<string, { enabled?: boolean } | undefined> };
  const store = STORE_CHECKOUT_METHODS.map(({ method, label }) => ({
    method,
    label,
    // Cash on delivery is on unless switched off, as Storify's public settings read it.
    on: method === "cod" ? settings.payment?.cod?.enabled !== false : Boolean(settings.payment?.[STORE_SWITCH[method]]?.enabled),
    esim: false,
  }));
  const esim = (await listAdminPaymentMethods()).map((row) => ({
    method: extensionChoice(row.code),
    label: row.name,
    on: row.status === "active" && row.missing.length === 0,
    esim: true,
  }));
  return [...store, ...esim];
}

function stored(raw: { order?: string[]; defaultMethod?: string | null; icons?: Array<{ method: string; url: string }> } | null | undefined): CheckoutDisplay {
  if (!raw) return EMPTY_CHECKOUT_DISPLAY;
  return {
    order: [...(raw.order ?? [])],
    defaultMethod: raw.defaultMethod || null,
    icons: Object.fromEntries((raw.icons ?? []).filter((icon) => isIconUrl(icon.url)).map((icon) => [icon.method, icon.url])),
  };
}

/** What checkout reads (Storify's public settings, the app's quote). Never throws. */
export async function publicCheckoutDisplay(): Promise<CheckoutDisplay> {
  try {
    await connectDB();
    return stored((await getEsimSettings()).toObject().checkoutDisplay);
  } catch (error) {
    console.error("Reading the checkout display failed:", error);
    return EMPTY_CHECKOUT_DISPLAY;
  }
}

export interface CheckoutDisplayAdmin extends CheckoutDisplay {
  /** Every method, in the order checkout would show them. */
  methods: CheckoutMethodRow[];
}

export async function getCheckoutDisplayAdmin(): Promise<CheckoutDisplayAdmin> {
  await connectDB();
  const display = stored((await getEsimSettings()).toObject().checkoutDisplay);
  const methods = arrangeMethods(
    (await knownMethods()).map((row) => ({ ...row, value: row.method })),
    display,
  ).map(({ value: _value, ...row }) => row);
  return { ...display, methods };
}

const METHOD = z.string().trim().min(1).max(60);

export const CheckoutDisplaySchema = z.object({
  order: z.array(METHOD).max(60),
  defaultMethod: METHOD.nullable(),
  icons: z.record(METHOD, z.string().trim().max(1000)),
});

/** Saves what the admin set, keeping only methods checkout knows; an empty icon is no icon. */
export async function saveCheckoutDisplay(input: z.infer<typeof CheckoutDisplaySchema>) {
  const before = await getCheckoutDisplayAdmin();
  const known = new Set(before.methods.map((row) => row.method));
  const order = [...new Set(input.order)].filter((method) => known.has(method));
  if (input.defaultMethod && !known.has(input.defaultMethod)) throw new Error("Unknown payment method");
  const icons = Object.entries(input.icons).filter(([method, url]) => known.has(method) && url);
  const bad = icons.find(([, url]) => !isIconUrl(url));
  if (bad) throw new Error(`The icon of ${bad[0]} must be an uploaded image or an https address`);
  const settings = await getEsimSettings();
  settings.set("checkoutDisplay", {
    order,
    defaultMethod: input.defaultMethod || null,
    icons: icons.map(([method, url]) => ({ method, url })),
  });
  await settings.save();
  return { before, after: await getCheckoutDisplayAdmin() };
}
