import { render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { testimonialsBlock } from '@/api/mocks/fixtures/home-story-blocks';
import { getMessages } from '@/i18n/messages';

import { Testimonials } from '../blocks/testimonials';

function InEnglish({ children }: PropsWithChildren) {
  return (
    <IntlProvider locale="en" messages={getMessages('en')}>
      {children}
    </IntlProvider>
  );
}

describe('Testimonials', () => {
  it('draws its title and each review: heading, comment and who wrote it', async () => {
    await render(<Testimonials block={testimonialsBlock} />, { wrapper: InEnglish });

    expect(screen.getByText('What shoppers say')).toBeTruthy();
    expect(screen.getByText('Exactly as described')).toBeTruthy();
    expect(screen.getByText('Nadia R.')).toBeTruthy();
    expect(
      screen.getByText('Good price and fast support when I needed a different size.')
    ).toBeTruthy();
  });

  it('says the rating in words, with a half star kept', async () => {
    await render(<Testimonials block={testimonialsBlock} />, { wrapper: InEnglish });

    expect(screen.getByLabelText('Rated 5 out of 5')).toBeTruthy();
    expect(screen.getByLabelText('Rated 4.5 out of 5')).toBeTruthy();
    expect(screen.getByLabelText('Rated 4 out of 5')).toBeTruthy();
  });

  it('draws nothing without reviews', async () => {
    await render(<Testimonials block={{ ...testimonialsBlock, testimonials: [] }} />, {
      wrapper: InEnglish,
    });

    expect(screen.toJSON()).toBeNull();
  });
});
