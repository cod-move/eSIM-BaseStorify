import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { lookListBlock } from '@/api/mocks/fixtures/home-story-blocks';
import { getMessages } from '@/i18n/messages';

import { LookList } from '../blocks/look-list';

const mockOpenLink = jest.fn();

jest.mock('@/features/config/use-open-link', () => ({ useOpenLink: () => mockOpenLink }));

function InEnglish({ children }: PropsWithChildren) {
  return (
    <IntlProvider locale="en" messages={getMessages('en')}>
      {children}
    </IntlProvider>
  );
}

describe('LookList', () => {
  afterEach(() => mockOpenLink.mockClear());

  it('draws its title and each look by name', async () => {
    await render(<LookList block={lookListBlock} />, { wrapper: InEnglish });

    expect(screen.getByText('Shop the looks')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Weekend' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Office' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Travel' })).toBeTruthy();
  });

  it('opens the collection of the look that is tapped', async () => {
    await render(<LookList block={lookListBlock} />, { wrapper: InEnglish });

    await fireEvent.press(screen.getByRole('link', { name: 'Office' }));

    expect(mockOpenLink).toHaveBeenCalledWith('/collections/office');
  });

  it('draws nothing without looks', async () => {
    await render(<LookList block={{ ...lookListBlock, looks: [] }} />, { wrapper: InEnglish });

    expect(screen.toJSON()).toBeNull();
  });
});
