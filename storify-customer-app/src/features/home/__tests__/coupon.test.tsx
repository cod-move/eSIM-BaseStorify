import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import type { CouponBlock } from '@/contracts/mobile/shop/v1';
import { getMessages } from '@/i18n/messages';

import { Coupon } from '../blocks/coupon';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('@/features/config/use-open-link', () => ({ useOpenLink: () => jest.fn() }));

const NOW = Date.parse('2026-10-02T10:00:00Z');

function InEnglish({ children }: PropsWithChildren) {
  return (
    <IntlProvider locale="en" messages={getMessages('en')}>
      {children}
    </IntlProvider>
  );
}

const coupon = (endsAt?: string): CouponBlock => ({
  type: 'COUPON',
  id: 'save10',
  code: 'SAVE10',
  offer: '10% off',
  condition: 'On orders over ৳1,000',
  ...(endsAt ? { endsAt } : null),
});

describe('Coupon', () => {
  afterEach(() => jest.useRealTimers());

  it('copies its code and says it did', async () => {
    await render(<Coupon block={coupon()} />, { wrapper: InEnglish });

    await fireEvent.press(screen.getByRole('button', { name: 'Copy the code SAVE10' }));

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('SAVE10');
    expect(await screen.findByRole('button', { name: 'The code SAVE10 is copied' })).toBeTruthy();
  });

  it('hides itself at the moment the discount ends', async () => {
    jest.useFakeTimers({ now: NOW });
    await render(<Coupon block={coupon('2026-10-02T10:00:30Z')} />, { wrapper: InEnglish });
    expect(screen.getByText('10% off')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(screen.queryByText('10% off')).toBeNull();
  });

  it('draws nothing once the discount has ended', async () => {
    jest.useFakeTimers({ now: NOW });
    await render(<Coupon block={coupon('2026-10-02T09:59:59Z')} />, { wrapper: InEnglish });

    expect(screen.queryByText('10% off')).toBeNull();
  });
});
