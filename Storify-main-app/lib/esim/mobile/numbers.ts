import QRCode from "qrcode";
import {
  EsimNumberDetail,
  EsimNumberList,
  EsimNumberPacketCancelRequest,
  EsimNumberQuote,
  EsimNumberRefreshRequest,
  EsimNumberRemark,
  EsimNumberRemarkRequest,
  EsimNumberTopupQuoteRequest,
  type EsimNumberSummary,
} from "@/contracts/mobile/shop/v1/esim";
import { defineRoute } from "@/lib/api-core/registry";
import { toMoney } from "@/lib/api-core/shop/money";
import { connectDB } from "@/lib/db";
import { installLinks } from "@/lib/esim/fulfillment/install-links";
import { translator, type Translate } from "@/lib/esim/i18n/server";
import {
  cancelCustomerPacket,
  getCustomerNumber,
  listCustomerNumbers,
  refreshCustomerNumber,
  updateNumberRemark,
  type CustomerNumberSummary,
} from "@/lib/esim/numbers/account";
import { DEFAULT_SMS_SENDER } from "@/lib/esim/numbers/card-tools";
import { formatCardBytes, packageLeftPercent } from "@/lib/esim/numbers/install";
import { findNumberTopupProduct } from "@/lib/esim/numbers/product";
import { latestQrRequest } from "@/lib/esim/numbers/requests";
import { getNumberSettings } from "@/lib/esim/numbers/settings";
import { numberTopupOptions } from "@/lib/esim/numbers/storefront";
import { numberTopupLine } from "@/lib/esim/numbers/topup";
import { SMS_MAX_CHARS } from "@/lib/esim/providers/topconnect";
import { getStoreCurrency } from "@/lib/intl/server-currency";
import { cardMoney, displayNumber, iso, packetGroupViews, rechargeView } from "./number-dto";
import { NUMBER_REASONS, numberNotFound, numberRefused } from "./number-refusals";

/**
 * The shopper app's own numbers (NUM-06~09): the website's readers
 * (lib/esim/numbers/account.ts), so ownership, the once-a-minute TopConnect
 * read and the install details are the website's. Credit and data packages
 * are bought as cart lines (the website's number top-up product), paid at
 * checkout and put on the number after the payment.
 */

function summaryOf(number: CustomerNumberSummary): EsimNumberSummary {
  const card = number.card;
  return {
    id: number.id,
    msisdn: number.msisdn,
    display: displayNumber(number.dialCode, number.nationalNumber),
    ...(number.country ? { country: number.country } : {}),
    ...(number.remark ? { remark: number.remark } : {}),
    blocked: card?.blocked ?? null,
    ...(card && card.balanceMinor !== null ? { balance: cardMoney(card.balanceMinor, card.currency ?? "EUR") } : {}),
    ...(card?.lastUsedAt ? { lastUsedAt: iso(card.lastUsedAt) } : {}),
    ...(number.validUntil ? { validUntil: iso(number.validUntil) } : {}),
  };
}

/** "€10 credit" (the website's English, account.ts) in the shopper's words. */
function pendingText(entry: string, t: Translate): string {
  const credit = /^(.+) credit$/.exec(entry);
  if (credit) return `${credit[1]} · ${t("esim.numbers.creditLine", "Credit on the number")}`;
  if (entry === "Data package") return t("esim.number.packet", "Data package");
  return entry;
}

async function detailOf(userId: string, numberId: string, locale: string): Promise<EsimNumberDetail> {
  const [number, options, mine, settings, t] = await Promise.all([
    getCustomerNumber(userId, numberId),
    numberTopupOptions(),
    listCustomerNumbers(userId),
    getNumberSettings(),
    translator(locale),
  ]);
  if (!number) throw numberNotFound();
  const qrRequest = await latestQrRequest(number.id);
  const card = number.card;
  const blocked = card?.blocked === true;
  const currency = card?.currency ?? options.recharge.currency;
  const lpa = number.install.lpa;
  const links = installLinks(lpa);
  const titleOf = (entry: CustomerNumberSummary) => displayNumber(entry.dialCode, entry.nationalNumber);
  const packetName = t("esim.number.packet", "Data package");

  return {
    ...summaryOf(number),
    iccid: number.iccid,
    ...(number.orderNumber ? { orderNumber: number.orderNumber } : {}),
    currency,
    checkedAt: iso(card?.checkedAt) ?? null,
    stale: number.refreshFailed,
    balanceMinor: card?.balanceMinor ?? null,
    packages: (card?.packages ?? []).map((entry) => {
      const percent = packageLeftPercent(entry.totalBytes, entry.leftBytes);
      const total = formatCardBytes(entry.totalBytes);
      const left = formatCardBytes(entry.leftBytes);
      const ordered = entry.status === "ordered";
      return {
        name: entry.name ?? packetName,
        ...(!ordered && entry.packetId && !blocked ? { packetId: entry.packetId } : {}),
        ordered,
        ...(total && percent !== null ? { total } : {}),
        ...(left && percent !== null ? { left } : {}),
        ...(percent !== null ? { leftPercent: percent } : {}),
        ...(entry.expiresAt ? { expiresAt: iso(entry.expiresAt) } : {}),
      };
    }),
    pending: number.pending.map((entry) => pendingText(entry, t)),
    ...(lpa
      ? {
          install: {
            lpa,
            qrImage: await QRCode.toDataURL(lpa, { width: 320, margin: 2, errorCorrectionLevel: "M" }),
            ...(number.install.smdpAddress ? { smdpAddress: number.install.smdpAddress } : {}),
            ...(number.install.matchingId ? { matchingId: number.install.matchingId } : {}),
            ...(links ? { iosLink: links.ios, androidLink: links.android } : {}),
            ...(number.install.pin1 ? { pin1: number.install.pin1 } : {}),
            ...(number.install.puk1 ? { puk1: number.install.puk1 } : {}),
            ...(number.install.pin2 ? { pin2: number.install.pin2 } : {}),
            ...(number.install.puk2 ? { puk2: number.install.puk2 } : {}),
          },
        }
      : {}),
    topups: {
      buyable: options.product !== null && options.recharge.usdPerUnit !== null && !blocked,
      recharge: rechargeView(options.recharge),
      packetGroups: packetGroupViews(options.packets, options.recharge.currency, locale, t),
    },
    // Credit may go to any of the platform's numbers; the shopper's others are offered.
    transferTargets: mine
      .filter((entry) => entry.id !== number.id && !entry.card?.blocked)
      .map((entry) => ({ msisdn: entry.msisdn, title: entry.remark ? `${titleOf(entry)} · ${entry.remark}` : titleOf(entry) })),
    qr: {
      enabled: settings.qrEnabled,
      fee: cardMoney(settings.qrFeeMinor, currency),
      ...(qrRequest
        ? {
            latest: {
              state: qrRequest.state,
              createdAt: new Date(qrRequest.createdAt).toISOString(),
              ...((qrRequest.resolution?.note ?? qrRequest.lastError?.message) ? { note: qrRequest.resolution?.note ?? qrRequest.lastError?.message ?? undefined } : {}),
            },
          }
        : {}),
    },
    smsSender: DEFAULT_SMS_SENDER,
    smsMaxChars: SMS_MAX_CHARS,
  };
}

/** GET /me/esim-numbers: the shopper's numbers, newest first, as last read. */
export const myNumbersRoute = defineRoute({
  id: "me.esim-numbers.list",
  method: "GET",
  path: "/me/esim-numbers",
  auth: "user",
  cache: { kind: "private" },
  etag: true,
  output: EsimNumberList,
  handler: async ({ session }) => {
    await connectDB();
    return { items: (await listCustomerNumbers(session.user.id)).map(summaryOf) };
  },
});

/** GET /me/esim-numbers/{id}: one number, read from TopConnect first (at most once a minute). */
export const myNumberRoute = defineRoute({
  id: "me.esim-numbers.detail",
  method: "GET",
  path: "/me/esim-numbers/{id}",
  auth: "user",
  cache: { kind: "private" },
  output: EsimNumberDetail,
  rateLimit: { bucket: "esim:number:detail", preset: "browse" },
  handler: async ({ session, params, locale }) => {
    await connectDB();
    return detailOf(session.user.id, params.id, locale);
  },
});

/** PATCH /me/esim-numbers/{id}: the shopper's own name for the number. */
export const myNumberRemarkRoute = defineRoute({
  id: "me.esim-numbers.remark",
  method: "PATCH",
  path: "/me/esim-numbers/{id}",
  auth: "user",
  cache: { kind: "private" },
  input: EsimNumberRemarkRequest,
  output: EsimNumberRemark,
  rateLimit: { bucket: "esim:remark", preset: "moderate" },
  demo: "allow",
  handler: async ({ session, params, input }) => {
    await connectDB();
    if (!(await updateNumberRemark(session.user.id, params.id, input.remark))) throw numberNotFound();
    return { remark: input.remark.trim() || null };
  },
});

/** POST /me/esim-numbers/{id}/refresh: the balance and packages from TopConnect now (every 10 s at most). */
export const refreshMyNumberRoute = defineRoute({
  id: "me.esim-numbers.refresh",
  method: "POST",
  path: "/me/esim-numbers/{id}/refresh",
  auth: "user",
  cache: { kind: "private" },
  input: EsimNumberRefreshRequest,
  output: EsimNumberDetail,
  rateLimit: { bucket: "esim:number:refresh", preset: "moderate" },
  demo: "allow",
  handler: async ({ session, params, locale }) => {
    await connectDB();
    if ((await refreshCustomerNumber(session.user.id, params.id)) === null) throw numberNotFound();
    return detailOf(session.user.id, params.id, locale);
  },
});

/** POST /me/esim-numbers/{id}/packets/cancel: one package on the card stops now; unused data is not refunded. */
export const cancelMyNumberPacketRoute = defineRoute({
  id: "me.esim-numbers.packets.cancel",
  method: "POST",
  path: "/me/esim-numbers/{id}/packets/cancel",
  auth: "user",
  cache: { kind: "private" },
  input: EsimNumberPacketCancelRequest,
  output: EsimNumberDetail,
  reasons: NUMBER_REASONS,
  rateLimit: { bucket: "esim:number:packet", preset: "moderate" },
  demo: "block-mutations",
  handler: async ({ session, params, input, locale }) => {
    await connectDB();
    const result = await cancelCustomerPacket(session.user.id, params.id, input.packetId);
    if (result === null) throw numberNotFound();
    if (!result.cancelled) throw numberRefused(result.message ?? "The package could not be cancelled");
    return detailOf(session.user.id, params.id, locale);
  },
});

/** POST /me/esim-numbers/{id}/topups/quote: credit or a data package for the number, as the cart line to send. */
export const myNumberTopupQuoteRoute = defineRoute({
  id: "me.esim-numbers.topups.quote",
  method: "POST",
  path: "/me/esim-numbers/{id}/topups/quote",
  auth: "user",
  cache: { kind: "private" },
  input: EsimNumberTopupQuoteRequest,
  output: EsimNumberQuote,
  reasons: NUMBER_REASONS,
  rateLimit: { bucket: "esim:number:topup-quote", preset: "moderate" },
  demo: "default",
  handler: async ({ session, params, input }) => {
    if ((input.recharge === undefined) === (input.packet === undefined)) throw numberRefused("Choose either credit or a data package");
    await connectDB();
    const choice = input.packet ? { number: params.id, packet: input.packet } : { number: params.id, recharge: input.recharge };
    const [line, product, currency] = await Promise.all([numberTopupLine(choice, session.user.id), findNumberTopupProduct(), getStoreCurrency()]);
    if (typeof line === "string") {
      if (/owns the number|from its page/.test(line)) throw numberNotFound();
      throw numberRefused(line);
    }
    if (!product) throw numberRefused("Number services are not available right now");
    return {
      productId: product.productId,
      variantId: product.variantId,
      lineAttributes: { numberTopup: choice },
      label: line.label,
      price: toMoney(line.priceMinor / 100, currency),
    };
  },
});
