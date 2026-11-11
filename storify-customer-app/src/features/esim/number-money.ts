import { useTranslations } from 'use-intl';

import { isApiError } from '@/api/errors';
import { useErrorMessage } from '@/i18n/use-error-message';

/**
 * The parts of a number's page with no screen (NUM-03~09): amounts typed in
 * the card's currency, and a refused action in the shopper's words. Pure but
 * for the hook. The store formats every amount shown (`Money.formatted`).
 */

/** "12.5" or "12,50" → 1250 cents; null when it is not an amount. No floating point. */
export function parseCardAmount(value: string): number | null {
  const match = /^(\d{1,5})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return cents > 0 ? cents : null;
}

/** Why a recharge cannot be taken: whole amounts from `min` to `max`. */
export function rechargeValid(minor: number, minMinor: number, maxMinor: number): boolean {
  return Number.isInteger(minor) && minor % 100 === 0 && minor >= minMinor && minor <= maxMinor;
}

/** "5550 1234": a number's digits grouped as the website prints them. */
export function groupDigits(digits: string): string {
  return digits.replace(/(\d{3,4})(?=(\d{4})+$)/g, '$1 ');
}

/** A key that makes a repeated action harmless: one per dialog opened. */
export function actionKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * A refused number action in the shopper's words: the store's reason when
 * the app knows it, the store's own sentence for one it does not, then the
 * app's usual words for the error.
 */
export function useNumberError(): (error: unknown) => string {
  const t = useTranslations('esim.numberReason');
  const describe = useErrorMessage();

  return (error) => {
    if (isApiError(error) && error.reason && error.reason !== 'REFUSED') {
      const key = error.reason as never;
      if (t.has(key)) return t(key);
    }
    if (isApiError(error) && error.code === 'CONFLICT' && error.message) return error.message;
    return describe(error);
  };
}
