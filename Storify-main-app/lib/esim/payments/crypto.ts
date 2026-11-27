import "server-only";

import { connectDB } from "@/lib/db";
import { ValidationError } from "@/lib/api/errors";
import { EsimPayment, EsimPaymentMethod, type IEsimPayment } from "@/models/esim-payment.model";
import { paymentMethodDefinition } from "./registry";
import { shownOn } from "./checkout-display";
import { publicCheckoutDisplay } from "@/lib/esim/admin/checkout-display";
import { CHECKOUT_REF, methodCredentials, paymentPage, startPayment, type StartContext } from "./service";
import { PaymentPluginError, type CryptoInvoice, type CryptoOption } from "./plugins/types";

/**
 * A crypto payment in the shopper app's own screen (APP-09): the gateway's
 * cashier page only shows a coin, an address and an amount, so the app shows
 * them itself — the same try, the same notification and the same settling as
 * the eSIM payment page (service.ts); the coin is chosen through the plugin's
 * `crypto` calls instead of on the gateway's page. The checkout reference is
 * the shopper's key, as it is for that page.
 */

export interface CryptoPaymentView {
  reference: string;
  method: string;
  /** Our try's state: "paid" once the gateway's notice is in, "pending" while it can be paid. */
  state: string;
  amountMinor: number;
  currency: string;
  /** The coins it can be paid in; empty once it cannot be paid (or changed) any more. */
  options: CryptoOption[];
  /** The address and amount, with the address as a QR code (a data URL). */
  invoice: (CryptoInvoice & { qr: string }) | null;
}

/** The methods the app pays for itself. */
export function isCryptoMethod(code: string): boolean {
  return Boolean(paymentMethodDefinition(code)?.plugin.crypto);
}

/** The checkout's methods as the app's screen lists them. */
export async function appPaymentChoices(checkoutRef: string) {
  const [view, display] = await Promise.all([paymentPage(checkoutRef), publicCheckoutDisplay()]);
  if (!view) return null;
  return {
    checkoutRef: view.checkoutRef,
    amountMinor: view.amountMinor,
    currency: view.currency,
    state: view.state,
    orderNumber: view.orderNumber,
    methods: view.methods.filter((method) => shownOn(display, "app", `extension:${method.code}`)).map((method) => ({
      code: method.code,
      name: method.name,
      native: Boolean(method.inApp),
      ...(method.inApp ? { nativeKind: method.inApp } : {}),
    })),
  };
}

const unavailable = () => new ValidationError("This payment method is not available");
const gatewayDown = () => new ValidationError("The payment service did not answer. Please try again in a moment.");

async function cryptoTry(checkoutRef: string, paymentRef: string) {
  if (!CHECKOUT_REF.test(checkoutRef) || !/^EP[0-9A-F]{16,40}$/.test(paymentRef)) return null;
  await connectDB();
  const payment = await EsimPayment.findOne({ reference: paymentRef, checkoutRef }).lean<IEsimPayment | null>();
  if (!payment) return null;
  const definition = paymentMethodDefinition(payment.method);
  const crypto = definition?.plugin.crypto;
  if (!definition || !crypto) throw unavailable();
  const method = await EsimPaymentMethod.findOne({ code: payment.method }).select("+secretCredentials");
  if (!method) throw unavailable();
  let credentials;
  try {
    credentials = methodCredentials(definition, method);
  } catch (error) {
    console.error(`The ${payment.method} settings cannot be read (enter its secrets again):`, error);
    throw unavailable();
  }
  return { payment, crypto, credentials };
}

async function withQr(invoice: CryptoInvoice | null) {
  if (!invoice) return null;
  const QRCode = (await import("qrcode")).default;
  // The address alone, as the gateway's own page encodes it: wallets read the amount from the screen.
  return { ...invoice, qr: await QRCode.toDataURL(invoice.address, { width: 320, margin: 2, errorCorrectionLevel: "M" }) };
}

function failed(error: unknown, what: string): never {
  console.error(`${what}:`, error instanceof Error ? error.message : error);
  if (error instanceof PaymentPluginError) throw new ValidationError(error.message.replace(/^BEpusdt: /, "") || "The payment could not be started.");
  throw gatewayDown();
}

/** The try as the screen shows it, asked of the gateway each time while it can be paid. */
export async function cryptoPayment(checkoutRef: string, paymentRef: string): Promise<CryptoPaymentView | null> {
  const found = await cryptoTry(checkoutRef, paymentRef);
  if (!found) return null;
  const { payment, crypto, credentials } = found;
  const base = { reference: payment.reference, method: payment.method, state: payment.state, amountMinor: payment.amountMinor, currency: payment.currency };
  if (payment.state !== "pending" || !payment.gatewayPaymentId) return { ...base, options: [], invoice: null };
  try {
    const invoice = await crypto.current(payment.gatewayPaymentId, credentials, fetch);
    const changeable = !invoice || invoice.state === "waiting";
    const options = changeable ? await crypto.options(payment.gatewayPaymentId, credentials, fetch) : [];
    return { ...base, options, invoice: await withQr(invoice) };
  } catch (error) {
    failed(error, `Reading the ${payment.method} payment ${payment.reference} failed`);
  }
}

/** Pays in this coin: the gateway gives the address (another coin later gives another). */
export async function chooseCrypto(checkoutRef: string, paymentRef: string, choice: { currency: string; network: string }): Promise<CryptoPaymentView | null> {
  const found = await cryptoTry(checkoutRef, paymentRef);
  if (!found) return null;
  const { payment, crypto, credentials } = found;
  if (payment.state !== "pending" || !payment.gatewayPaymentId) throw new ValidationError("This payment can no longer be changed.");
  try {
    const options = await crypto.options(payment.gatewayPaymentId, credentials, fetch);
    if (!options.some((option) => option.currency === choice.currency.toUpperCase() && option.network === choice.network)) throw unavailable();
    const invoice = await crypto.choose(payment.gatewayPaymentId, choice, credentials, fetch);
    return {
      reference: payment.reference,
      method: payment.method,
      state: payment.state,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      options: invoice.state === "waiting" ? options : [],
      invoice: await withQr(invoice),
    };
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    failed(error, `Choosing a coin for the ${payment.method} payment ${payment.reference} failed`);
  }
}

/** Starts (or takes up again) a try with a method the app pays for itself. */
export async function startCryptoPayment(checkoutRef: string, methodCode: string, context: StartContext): Promise<CryptoPaymentView> {
  if (!isCryptoMethod(methodCode)) throw unavailable();
  const started = await startPayment(checkoutRef, methodCode, { ...context, app: true });
  const view = await cryptoPayment(checkoutRef, started.reference);
  // A try the gateway gave no id for cannot be paid here: the page is still there for it.
  if (!view || (view.state === "pending" && !view.options.length && !view.invoice)) throw unavailable();
  return view;
}
