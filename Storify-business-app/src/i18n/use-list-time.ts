import { useCallback, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

/**
 * Times and dates as lists and threads show them, in the
 * operator's language and the phone's time zone.
 *
 * The phone has no relative-time formatter (Hermes has no
 * `Intl.RelativeTimeFormat`), so nothing here says "3 minutes ago": a list
 * says the time today, "Yesterday", the weekday within the week, else the
 * date. A value the store sent that is not a date gives an empty string.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `date`'s day to `now`'s, by the calendar: 0 today, 1 yesterday. */
export function daysBefore(date: Date, now: Date): number {
  const midnight = (value: Date) => {
    const copy = new Date(value);
    copy.setHours(0, 0, 0, 0);
    return copy.getTime();
  };
  // Rounded: a day with a clock change is 23 or 25 hours long.
  return Math.round((midnight(now) - midnight(date)) / DAY_MS);
}

function parse(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Today, shared by every list and thread on screen. It changes at midnight
 * (one timer, and a look at the clock when the app comes back to the front,
 * as a phone holds timers in the background), so a list left open follows
 * the calendar: "Today" becomes "Yesterday", a time becomes a weekday.
 */
let today = new Date();
const watchers = new Set<() => void>();
let stopWatching: (() => void) | null = null;

function checkDay() {
  const now = new Date();
  if (daysBefore(today, now) === 0) return;
  today = now;
  watchers.forEach((watcher) => watcher());
}

function watchDay(): () => void {
  let timer: ReturnType<typeof setTimeout>;
  const untilMidnight = () => {
    const midnight = new Date(today);
    midnight.setHours(24, 0, 0, 0);
    // A second past it: a timer can fire a little early.
    timer = setTimeout(
      () => {
        checkDay();
        untilMidnight();
      },
      Math.max(midnight.getTime() - Date.now(), 0) + 1_000
    );
  };
  untilMidnight();
  const subscription = AppState.addEventListener('change', (status) => {
    if (status === 'active') checkDay();
  });
  return () => {
    clearTimeout(timer);
    subscription.remove();
  };
}

function subscribe(watcher: () => void): () => void {
  watchers.add(watcher);
  if (watchers.size === 1) {
    // Nothing watched the day for a while: it may have changed meanwhile.
    checkDay();
    stopWatching = watchDay();
  }
  return () => {
    watchers.delete(watcher);
    if (watchers.size === 0) {
      stopWatching?.();
      stopWatching = null;
    }
  };
}

const getToday = () => today;

/** Today, for what a screen says relative to it; the screen shows again when the day changes. */
export function useToday(): Date {
  return useSyncExternalStore(subscribe, getToday, getToday);
}

/** "10:42" today, "Yesterday", "Mon" within the week, "5 Oct", "5 Oct 2025". */
export function useListTime(): (iso: string, now?: Date) => string {
  const format = useFormatter();
  const t = useTranslations('time');
  const today = useToday();

  return useCallback(
    (iso, now = today) => {
      const date = parse(iso);
      if (!date) return '';
      const days = daysBefore(date, now);
      // A time ahead of the phone's clock (a few seconds of difference) is today's.
      if (days <= 0) return format.dateTime(date, { hour: 'numeric', minute: '2-digit' });
      if (days === 1) return t('yesterday');
      if (days < 7) return format.dateTime(date, { weekday: 'short' });
      return date.getFullYear() === now.getFullYear()
        ? format.dateTime(date, { day: 'numeric', month: 'short' })
        : format.dateTime(date, { day: 'numeric', month: 'short', year: 'numeric' });
    },
    [format, t, today]
  );
}

/** A thread's day separator: "Today", "Yesterday", "Mon, 5 Oct", "Mon, 5 Oct 2025". */
export function useDayLabel(): (iso: string, now?: Date) => string {
  const format = useFormatter();
  const t = useTranslations('time');
  const today = useToday();

  return useCallback(
    (iso, now = today) => {
      const date = parse(iso);
      if (!date) return '';
      const days = daysBefore(date, now);
      if (days <= 0) return t('today');
      if (days === 1) return t('yesterday');
      return format.dateTime(date, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
      });
    },
    [format, t, today]
  );
}

/** A date on its own: "5 Oct", or "5 Oct 2025" when it is not this year's. */
export function useShortDate(): (iso: string, now?: Date) => string {
  const format = useFormatter();
  const today = useToday();

  return useCallback(
    (iso, now = today) => {
      const date = parse(iso);
      if (!date) return '';
      return format.dateTime(date, {
        day: 'numeric',
        month: 'short',
        ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
      });
    },
    [format, today]
  );
}

/** A moment: "5 Oct, 10:42", with the year when it is not this year's. */
export function useDateTime(): (iso: string, now?: Date) => string {
  const format = useFormatter();
  const today = useToday();

  return useCallback(
    (iso, now = today) => {
      const date = parse(iso);
      if (!date) return '';
      return format.dateTime(date, {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
      });
    },
    [format, today]
  );
}

/** Whether a moment is still ahead of the phone's clock: a reply window that has not closed. */
export function isAhead(iso: string | undefined, now: number = Date.now()): boolean {
  if (!iso) return false;
  const date = parse(iso);
  return date !== null && date.getTime() > now;
}
