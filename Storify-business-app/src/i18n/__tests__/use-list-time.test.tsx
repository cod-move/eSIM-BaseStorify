import { act, renderHook } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { IntlProvider } from 'use-intl';

import { getMessages } from '../messages';
import { isAhead, useDayLabel, useListTime, useShortDate } from '../use-list-time';

// The phone's own time zone, as the app's provider gives it: the one its days are counted in.
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function wrapper({ children }: PropsWithChildren) {
  return (
    <IntlProvider locale="en" messages={getMessages('en')} timeZone={timeZone}>
      {children}
    </IntlProvider>
  );
}

const at = (iso: string) => new Date(iso);
const NOW = at('2026-10-05T15:00:00');

describe('times in a list', () => {
  // The day is the phone's: these run in the test machine's time zone, as the app does.
  it('says the time today, "Yesterday", the weekday within the week, else the date', async () => {
    const { result } = await renderHook(() => useListTime(), { wrapper });
    const time = result.current;

    expect(time(at('2026-10-05T09:30:00').toISOString(), NOW)).toMatch(/\d{1,2}:30/);
    expect(time(at('2026-10-04T23:00:00').toISOString(), NOW)).toBe('Yesterday');
    expect(time(at('2026-10-01T10:00:00').toISOString(), NOW)).toMatch(
      /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/
    );
    expect(time(at('2026-08-14T10:00:00').toISOString(), NOW)).toMatch(/^(14 Aug|Aug 14)$/);
    expect(time(at('2025-08-14T10:00:00').toISOString(), NOW)).toContain('2025');
    expect(time('not a date', NOW)).toBe('');
  });

  it('names a thread’s days: "Today", "Yesterday", then the weekday and date', async () => {
    const { result } = await renderHook(() => useDayLabel(), { wrapper });
    const label = result.current;

    expect(label(at('2026-10-05T01:00:00').toISOString(), NOW)).toBe('Today');
    expect(label(at('2026-10-04T12:00:00').toISOString(), NOW)).toBe('Yesterday');
    expect(label(at('2026-09-28T12:00:00').toISOString(), NOW)).toMatch(/Mon/);
  });

  it('writes a date alone, with the year only when it is not this one', async () => {
    const { result } = await renderHook(() => useShortDate(), { wrapper });

    expect(result.current(at('2026-01-02T12:00:00').toISOString(), NOW)).not.toContain('2026');
    expect(result.current(at('2025-01-02T12:00:00').toISOString(), NOW)).toContain('2025');
  });
});

describe('a moment ahead of the phone’s clock', () => {
  it('is a reply window still open', () => {
    const now = NOW.getTime();
    expect(isAhead('2026-10-05T15:00:01', now)).toBe(true);
    expect(isAhead('2026-10-05T14:59:59', now)).toBe(false);
    expect(isAhead(undefined, now)).toBe(false);
    expect(isAhead('soon', now)).toBe(false);
  });
});

describe('a list left open past midnight', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('follows the calendar: today’s time becomes "Yesterday" when the day changes', async () => {
    jest.useFakeTimers({ now: at('2026-10-05T23:59:30') });
    const message = at('2026-10-05T23:00:00').toISOString();
    // What the row shows: written as it renders, so it changes only if the row renders again.
    const { result } = await renderHook(() => useListTime()(message), { wrapper });
    expect(result.current).toMatch(/\d{1,2}:00/);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });
    expect(result.current).toBe('Yesterday');
  });

  it('looks at the clock when the app comes back to the front: the phone held its timers', async () => {
    jest.useFakeTimers({ now: at('2026-10-05T22:00:00') });
    const message = at('2026-10-05T21:00:00').toISOString();
    const { result } = await renderHook(() => useDayLabel()(message), { wrapper });
    expect(result.current).toBe('Today');

    // The night passed in the background: no timer ran.
    jest.setSystemTime(at('2026-10-06T08:00:00'));
    const [, comeBack] = jest
      .mocked(AppState.addEventListener)
      .mock.calls.filter(([event]) => event === 'change')
      .at(-1)!;
    await act(async () => {
      comeBack('active');
    });
    expect(result.current).toBe('Yesterday');
  });
});
