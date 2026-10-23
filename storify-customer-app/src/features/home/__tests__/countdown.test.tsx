import { act, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import type { CountdownBlock } from '@/contracts/mobile/shop/v1';
import { getMessages } from '@/i18n/messages';

import { Countdown, timeLeft } from '../blocks/countdown';

jest.mock('@/features/config/use-open-link', () => ({ useOpenLink: () => jest.fn() }));

const NOW = Date.parse('2026-10-02T10:00:00Z');

function InEnglish({ children }: PropsWithChildren) {
  return (
    <IntlProvider locale="en" messages={getMessages('en')}>
      {children}
    </IntlProvider>
  );
}

const countdown = (endsAt: string): CountdownBlock => ({
  type: 'COUNTDOWN',
  id: 'flash',
  layout: 'BANNER',
  endsAt,
  heading: 'Flash sale',
  products: [],
});

describe('timeLeft', () => {
  it('splits what is left into days, hours, minutes and seconds', () => {
    expect(timeLeft('2026-10-04T13:05:09Z', NOW)).toEqual({
      days: 2,
      hours: 3,
      minutes: 5,
      seconds: 9,
    });
  });

  it('is nothing once the time has come, or when the store sent no time', () => {
    expect(timeLeft('2026-10-02T10:00:00Z', NOW)).toBeNull();
    expect(timeLeft('2026-10-01T23:59:59Z', NOW)).toBeNull();
    expect(timeLeft('next week', NOW)).toBeNull();
  });
});

describe('Countdown', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW }));
  afterEach(() => jest.useRealTimers());

  it('counts down every second and hides itself when the time is up', async () => {
    await render(<Countdown block={countdown('2026-10-02T10:02:05Z')} />, { wrapper: InEnglish });

    expect(
      screen.getByRole('timer', { name: 'Ends in 0 days, 0 hours and 2 minutes' })
    ).toBeTruthy();
    expect(screen.getByText('05')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText('04')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(124_000);
    });
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.queryByText('Flash sale')).toBeNull();
  });

  it('draws nothing for a deadline that has passed', async () => {
    await render(<Countdown block={countdown('2026-10-01T10:00:00Z')} />, { wrapper: InEnglish });

    expect(screen.queryByText('Flash sale')).toBeNull();
  });
});
