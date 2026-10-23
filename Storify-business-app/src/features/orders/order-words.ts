import { useFormatter, useTranslations } from 'use-intl';

import { storeWord } from '@/features/status/status-tone';
import { useRtl } from '@/i18n/use-rtl';

/**
 * A left-to-right mark. Among Arabic letters a number is read as an Arabic
 * number and the `#` leaves it for the other side ("1042#"); the mark before
 * it keeps "#1042" together, left to right, as every code is shown.
 */
const LRM = '\u200E';

/**
 * How the orders screens say a time, a payment method and a sales channel:
 * the store sends codes and ISO times; the app says them in the operator's
 * language and time zone. A code the app does not know is shown as the store
 * wrote it.
 */
export function useOrderWords() {
  const t = useTranslations('orders');
  const format = useFormatter();
  const rtl = useRtl();

  const sameDay = (a: Date, b: Date) =>
    format.dateTime(a, { year: 'numeric', month: 'numeric', day: 'numeric' }) ===
    format.dateTime(b, { year: 'numeric', month: 'numeric', day: 'numeric' });
  const sameYear = (a: Date, b: Date) =>
    format.dateTime(a, { year: 'numeric' }) === format.dateTime(b, { year: 'numeric' });

  return {
    /** In a list: the time today, the day this year, the full date before. */
    shortDate(iso: string): string {
      const date = new Date(iso);
      const now = new Date();
      if (sameDay(date, now)) return format.dateTime(date, { hour: 'numeric', minute: '2-digit' });
      if (sameYear(date, now)) return format.dateTime(date, { day: 'numeric', month: 'short' });
      return format.dateTime(date, { day: 'numeric', month: 'short', year: 'numeric' });
    },
    /** On an order: the day and the time. */
    longDate(iso: string): string {
      return format.dateTime(new Date(iso), {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    },
    paymentMethod(code: string): string {
      const key = `paymentMethods.${code}` as never;
      return t.has(key) ? t(key) : storeWord(code);
    },
    channel(code: string): string {
      const key = `channels.${code}` as never;
      return t.has(key) ? t(key) : storeWord(code);
    },
    /** "#1042", left to right in every language. */
    number(number: string): string {
      const text = t('number', { number });
      return rtl ? `${LRM}${text}${LRM}` : text;
    },
  };
}
