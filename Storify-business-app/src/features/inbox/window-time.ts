import { useFormatter } from 'use-intl';

import { useToday } from '@/i18n/use-list-time';

/**
 * When a channel's reply window closes, in the operator's language: the time
 * alone today ("14:05"), with the weekday on another day ("Tue 14:05"), so a
 * window that ends tomorrow is never read as ending today.
 */
export function useWindowTime(): (end: Date) => string {
  const format = useFormatter();
  const today = useToday();

  return (end) =>
    format.dateTime(
      end,
      end.toDateString() === today.toDateString()
        ? { hour: 'numeric', minute: '2-digit' }
        : { weekday: 'short', hour: 'numeric', minute: '2-digit' }
    );
}
