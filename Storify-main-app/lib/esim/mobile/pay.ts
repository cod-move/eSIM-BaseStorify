import { EsimCryptoChooseRequest, EsimCryptoPayment, EsimCryptoQuery, EsimCryptoStartRequest, EsimPayChoices } from "@/contracts/mobile/shop/v1/esim";
import { MobileApiError } from "@/lib/api-core/errors";
import { defineRoute } from "@/lib/api-core/registry";
import { toMoney } from "@/lib/api-core/shop/money";
import { ValidationError } from "@/lib/api/errors";
import { appBaseUrl } from "@/lib/app-url";
import { appPaymentChoices, chooseCrypto, cryptoPayment, startCryptoPayment, type CryptoPaymentView } from "@/lib/esim/payments/crypto";

/**
 * The eSIM payment page's methods in the shopper app (APP-09): the app lists
 * them itself, pays a crypto method in its own screen (lib/esim/payments/crypto.ts)
 * and opens the page for the others. The checkout reference is the key, as
 * it is for the page: guests pay too.
 */

const notFound = () => new MobileApiError(404, "NOT_FOUND", "Payment not found.");

/** The gateway's or our refusal, as the app shows it. */
async function refusing<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ValidationError) throw new MobileApiError(409, "CONFLICT", error.message);
    throw error;
  }
}

function dto(view: CryptoPaymentView) {
  const { amountMinor, currency, ...rest } = view;
  return { ...rest, total: toMoney(amountMinor / 100, currency) };
}

/** GET /esim/pay/{reference}: the methods the checkout can be paid with. */
export const esimPayChoicesRoute = defineRoute({
  id: "esim.pay.choices",
  method: "GET",
  path: "/esim/pay/{reference}",
  auth: "optional",
  cache: { kind: "private" },
  rateLimit: { bucket: "esim:pay:read", preset: "lenient" },
  output: EsimPayChoices,
  handler: async ({ params }) => {
    const choices = await appPaymentChoices(params.reference);
    if (!choices) throw notFound();
    const { amountMinor, currency, ...rest } = choices;
    return { ...rest, total: toMoney(amountMinor / 100, currency) };
  },
});

/** POST /esim/pay/{reference}/crypto: starts (or takes up again) a try with a method the app pays itself. */
export const esimCryptoStartRoute = defineRoute({
  id: "esim.pay.crypto.start",
  method: "POST",
  path: "/esim/pay/{reference}/crypto",
  auth: "optional",
  cache: { kind: "private" },
  rateLimit: { bucket: "esim:pay:start", preset: "strict" },
  demo: "block-mutations",
  input: EsimCryptoStartRequest,
  output: EsimCryptoPayment,
  handler: ({ params, input, client, locale }) =>
    refusing(async () =>
      dto(
        await startCryptoPayment(params.reference, input.method, {
          origin: appBaseUrl(),
          clientIp: client.ip || "",
          userAgent: [client.platform, client.appVersion].filter(Boolean).join(" ") || "app",
          locale,
          app: true,
        }),
      ),
    ),
});

/** GET /esim/pay/{reference}/crypto?payment=: the try as it stands, asked of the gateway. */
export const esimCryptoReadRoute = defineRoute({
  id: "esim.pay.crypto.read",
  method: "GET",
  path: "/esim/pay/{reference}/crypto",
  auth: "optional",
  cache: { kind: "private" },
  rateLimit: { bucket: "esim:pay:read", preset: "lenient" },
  input: EsimCryptoQuery,
  output: EsimCryptoPayment,
  handler: ({ params, input }) =>
    refusing(async () => {
      const view = await cryptoPayment(params.reference, input.payment);
      if (!view) throw notFound();
      return dto(view);
    }),
});

/** POST /esim/pay/{reference}/crypto/choose: pays in this coin; the gateway gives its address. */
export const esimCryptoChooseRoute = defineRoute({
  id: "esim.pay.crypto.choose",
  method: "POST",
  path: "/esim/pay/{reference}/crypto/choose",
  auth: "optional",
  cache: { kind: "private" },
  rateLimit: { bucket: "esim:pay:start", preset: "strict" },
  demo: "block-mutations",
  input: EsimCryptoChooseRequest,
  output: EsimCryptoPayment,
  handler: ({ params, input }) =>
    refusing(async () => {
      const view = await chooseCrypto(params.reference, input.payment, { currency: input.currency, network: input.network });
      if (!view) throw notFound();
      return dto(view);
    }),
});
