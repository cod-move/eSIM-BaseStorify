import { render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { getMessages } from '@/i18n/messages';

import { badgeCount, CountBadge, describeStatus, DiscountPill, StatusBadge } from '../badge';

const inLocale = (locale: string) =>
  function LocaleProvider({ children }: PropsWithChildren) {
    return (
      <IntlProvider locale={locale} messages={getMessages(locale)}>
        {children}
      </IntlProvider>
    );
  };

// The count sits inside its button, which speaks it: the badge itself is hidden from screen readers.
const hidden = { includeHiddenElements: true };

describe('badgeCount', () => {
  it('shows nothing at zero, or for anything that is not a count', () => {
    expect(badgeCount(0)).toBeNull();
    expect(badgeCount(-3)).toBeNull();
    expect(badgeCount(Number.NaN)).toBeNull();
  });

  it('shows the count up to the most it spells out', () => {
    expect(badgeCount(1)).toEqual({ value: 1, more: false });
    expect(badgeCount(99)).toEqual({ value: 99, more: false });
  });

  it('shows the most with a plus above it', () => {
    expect(badgeCount(100)).toEqual({ value: 99, more: true });
    expect(badgeCount(5000)).toEqual({ value: 99, more: true });
    expect(badgeCount(10, 9)).toEqual({ value: 9, more: true });
  });
});

describe('CountBadge', () => {
  it('draws nothing for an empty cart', async () => {
    const view = await render(<CountBadge count={0} />, { wrapper: inLocale('en') });
    expect(view.toJSON()).toBeNull();
  });

  it('prints the count, and 99+ above 99', async () => {
    await render(
      <>
        <CountBadge count={7} />
        <CountBadge count={100} />
      </>,
      { wrapper: inLocale('en') }
    );
    expect(screen.getByText('7', hidden)).toBeTruthy();
    expect(screen.getByText('99+', hidden)).toBeTruthy();
  });
});

describe('describeStatus', () => {
  it.each([
    ['pending', 'progress'],
    ['processing', 'progress'],
    ['shipped', 'progress'],
    ['delivered', 'done'],
    ['cancelled', 'stopped'],
    ['refunded', 'stopped'],
    ['preordered', 'preorder'],
  ])('%s is a %s status with its own word', (status, tone) => {
    expect(describeStatus(status)).toMatchObject({ tone, known: status });
  });

  it('knows a status however the store spells it', () => {
    expect(describeStatus('Processing')).toMatchObject({ tone: 'progress', known: 'processing' });
    expect(describeStatus(' SHIPPED ')).toMatchObject({ tone: 'progress', known: 'shipped' });
    expect(describeStatus('canceled')).toMatchObject({ tone: 'stopped', known: 'cancelled' });
    expect(describeStatus('pre-order')).toMatchObject({ tone: 'preorder', known: 'preordered' });
    expect(describeStatus('pre_ordered')).toMatchObject({ tone: 'preorder', known: 'preordered' });
  });

  it('gives a status it does not know a neutral tone and the store words, as written', () => {
    expect(describeStatus('awaiting_stock')).toEqual({
      tone: 'neutral',
      known: null,
      text: 'Awaiting stock',
    });
    expect(describeStatus('on-hold')).toMatchObject({ tone: 'neutral', text: 'On hold' });
  });

  it('does not mistake an object property for a status', () => {
    for (const status of ['constructor', 'toString', '__proto__', '']) {
      expect(describeStatus(status)).toMatchObject({ tone: 'neutral', known: null });
    }
  });
});

describe('StatusBadge', () => {
  it('names a known status in the app language', async () => {
    await render(<StatusBadge status="processing" />, { wrapper: inLocale('en') });
    expect(screen.getByText('Processing')).toBeTruthy();
  });

  it('names it in Arabic too', async () => {
    await render(<StatusBadge status="cancelled" />, { wrapper: inLocale('ar') });
    expect(screen.getByText('ملغي')).toBeTruthy();
  });

  it('shows an unknown status as the store sent it', async () => {
    await render(<StatusBadge status="awaiting_stock" />, { wrapper: inLocale('bn') });
    expect(screen.getByText('Awaiting stock')).toBeTruthy();
  });
});

describe('DiscountPill', () => {
  it('prints the store label and works nothing out', async () => {
    await render(<DiscountPill label="10% OFF" />, { wrapper: inLocale('en') });
    expect(screen.getByText('10% OFF')).toBeTruthy();
  });
});
