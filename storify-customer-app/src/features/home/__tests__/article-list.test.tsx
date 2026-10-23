import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { articleListBlock } from '@/api/mocks/fixtures/home-story-blocks';
import { getMessages } from '@/i18n/messages';

import { ArticleList } from '../blocks/article-list';

const mockOpenLink = jest.fn();

jest.mock('@/features/config/use-open-link', () => ({ useOpenLink: () => mockOpenLink }));

function InEnglish({ children }: PropsWithChildren) {
  return (
    <IntlProvider locale="en" messages={getMessages('en')} timeZone="UTC">
      {children}
    </IntlProvider>
  );
}

describe('ArticleList', () => {
  afterEach(() => mockOpenLink.mockClear());

  it('draws its title, each article and who wrote it, with the date when there is one', async () => {
    await render(<ArticleList block={articleListBlock} />, { wrapper: InEnglish });

    expect(screen.getByText('From the journal')).toBeTruthy();
    expect(screen.getByText('What to carry every day')).toBeTruthy();
    expect(screen.getByText('By Tarek Aziz · Sep 2, 2026')).toBeTruthy();
    expect(screen.getByText('By Mira Hasan')).toBeTruthy();
  });

  it('opens the link of the article that is tapped', async () => {
    await render(<ArticleList block={articleListBlock} />, { wrapper: InEnglish });

    await fireEvent.press(
      screen.getByRole('link', { name: 'Choosing earbuds you will actually wear' })
    );

    expect(mockOpenLink).toHaveBeenCalledWith('/blog/choosing-earbuds');
  });

  it('draws nothing without articles', async () => {
    await render(<ArticleList block={{ ...articleListBlock, articles: [] }} />, {
      wrapper: InEnglish,
    });

    expect(screen.toJSON()).toBeNull();
  });
});
