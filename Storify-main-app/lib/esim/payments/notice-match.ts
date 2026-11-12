/**
 * Whether a gateway's "paid" notice pays the try it names (service.ts
 * receiveNotice). Pure, so the rule is tested on its own.
 *
 *  - "exact": the amount and currency we asked for (or the gateway did not say).
 *  - "converted": the gateway charged the shopper in another currency it
 *    converted to itself — Airwallex's automatic currency conversion turns a
 *    USD PaymentIntent into, say, CNY when the shopper picks it on the hosted
 *    page, and reports the intent in CNY. Accepted only from a plugin that
 *    says its gateway does this, for the very intent we created (its id
 *    matches the one recorded when the try started), with a positive amount:
 *    the amount was fixed by us when the intent was created and the
 *    conversion is the gateway's.
 *  - "wrong": anything else, which waits for a person.
 */
export type NoticeMatch = "exact" | "converted" | "wrong";

export function noticeMatch(
  payment: { amountMinor: number; currency: string; gatewayPaymentId?: string | null },
  notice: { amountMinor: number | null; currency: string | null; gatewayPaymentId?: string | null },
  gatewayConverts: boolean,
): NoticeMatch {
  const currency = notice.currency?.toUpperCase() ?? null;
  const sameCurrency = currency === null || currency === payment.currency.toUpperCase();
  if (sameCurrency) {
    return notice.amountMinor === null || notice.amountMinor === payment.amountMinor ? "exact" : "wrong";
  }
  const sameIntent = Boolean(payment.gatewayPaymentId) && notice.gatewayPaymentId === payment.gatewayPaymentId;
  return gatewayConverts && sameIntent && (notice.amountMinor ?? 0) > 0 ? "converted" : "wrong";
}
