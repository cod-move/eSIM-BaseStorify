import { ESIM_NUMBER_REASONS, type EsimNumberReason } from "@/contracts/mobile/shop/v1/esim";
import { MobileApiError } from "@/lib/api-core/errors";

/**
 * A number action the website's services refused (lib/esim/numbers/*), as
 * the app's 409: the services answer with an English sentence for the
 * website's toast, so it is matched here to one of `ESIM_NUMBER_REASONS`,
 * which the app words in the shopper's language. A sentence matched by none
 * goes out as `REFUSED` with the sentence itself.
 */

const PATTERNS: ReadonlyArray<[RegExp, EsimNumberReason]> = [
  [/^Sign in/i, "SIGN_IN"],
  [/just been taken/i, "NUMBER_TAKEN"],
  [/no longer offered|Unknown data package/i, "PACKET_GONE"],
  [/cannot be priced/i, "NOT_PRICED"],
  [/whole amount|amount between|Enter an amount/i, "BAD_AMOUNT"],
  [/blocked/i, "BLOCKED"],
  [/not available right now|cannot be requested right now/i, "UNAVAILABLE"],
  [/network's records could not be read|TopConnect did not answer/i, "NETWORK_FAILED"],
  [/with its country code/i, "BAD_NUMBER"],
  [/^Choose another number|cannot forward to itself/i, "SAME_NUMBER"],
  [/not one of the platform's numbers/i, "NOT_PLATFORM_NUMBER"],
  [/different currencies/i, "CURRENCY_MISMATCH"],
  [/^The number has /i, "NOT_ENOUGH_CREDIT"],
  [/still being made/i, "TRANSFER_OPEN"],
  [/already been requested/i, "QR_OPEN"],
  [/reconnected a few minutes ago/i, "RECONNECT_WAIT"],
  [/cannot be reconnected/i, "RECONNECT_UNSUPPORTED"],
  [/Mobile data stays on/i, "DATA_STAYS_ON"],
  [/daily limit between/i, "BAD_LIMIT"],
  [/not on the number any more/i, "PACKET_NOT_ON_CARD"],
  [/No account uses this email/i, "NO_ACCOUNT"],
  [/already on your account/i, "SAME_ACCOUNT"],
  [/Type the number exactly/i, "CONFIRM_MISMATCH"],
  [/Too many wrong codes/i, "TOO_MANY_TRIES"],
  [/refresh and try again/i, "REFRESH_RETRY"],
];

export function numberReasonOf(message: string): EsimNumberReason {
  return PATTERNS.find(([pattern]) => pattern.test(message))?.[1] ?? "REFUSED";
}

/** The 409 for a refused number action. */
export function numberRefused(message: string): MobileApiError {
  return new MobileApiError(409, "CONFLICT", message, { reason: numberReasonOf(message) });
}

export function numberNotFound(): MobileApiError {
  return new MobileApiError(404, "NOT_FOUND", "Number not found.");
}

/** The reasons every number route may answer with. */
export const NUMBER_REASONS = { values: ESIM_NUMBER_REASONS };
