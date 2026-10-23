import { render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { getMessages } from '@/i18n/messages';

import { CompactRating, starFills, StarRating } from '../rating';

const inLocale = (locale: string) =>
  function LocaleProvider({ children }: PropsWithChildren) {
    return (
      <IntlProvider locale={locale} messages={getMessages(locale)}>
        {children}
      </IntlProvider>
    );
  };

describe('starFills', () => {
  it('fills the stars to the average, in quarter steps', () => {
    expect(starFills(5)).toEqual([1, 1, 1, 1, 1]);
    expect(starFills(4.5)).toEqual([1, 1, 1, 1, 0.5]);
    expect(starFills(4.3)).toEqual([1, 1, 1, 1, 0.25]);
    expect(starFills(3.9)).toEqual([1, 1, 1, 1, 0]);
    expect(starFills(0.5)).toEqual([0.5, 0, 0, 0, 0]);
    expect(starFills(0)).toEqual([0, 0, 0, 0, 0]);
  });

  it('stays within five stars for a value outside the scale', () => {
    expect(starFills(7)).toEqual([1, 1, 1, 1, 1]);
    expect(starFills(-2)).toEqual([0, 0, 0, 0, 0]);
    expect(starFills(Number.NaN)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('CompactRating', () => {
  it('shows the average and says the rating in words', async () => {
    await render(<CompactRating rating={{ average: 4.5, count: 350 }} />, {
      wrapper: inLocale('en'),
    });
    expect(screen.getByText('4.5')).toBeTruthy();
    expect(screen.getByLabelText('4.5 out of 5, 350 reviews')).toBeTruthy();
  });

  it('shows the count when asked', async () => {
    await render(<CompactRating rating={{ average: 4.5, count: 350 }} showCount />, {
      wrapper: inLocale('en'),
    });
    expect(screen.getByText('(350)')).toBeTruthy();
  });
});

describe('StarRating', () => {
  it('shows the count and the sold number, and says all of it', async () => {
    await render(<StarRating rating={{ average: 4.5, count: 1 }} soldCount={3} />, {
      wrapper: inLocale('en'),
    });
    expect(screen.getByText('(1)')).toBeTruthy();
    expect(screen.getByText('3 sold')).toBeTruthy();
    expect(screen.getByLabelText('4.5 out of 5, 1 review, 3 sold')).toBeTruthy();
  });
});
