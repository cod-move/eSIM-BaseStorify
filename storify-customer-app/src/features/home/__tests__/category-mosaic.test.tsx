import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { categoryMosaicBlock } from '@/api/mocks/fixtures/home-story-blocks';
import type { Category } from '@/contracts/mobile/shop/v1';
import { getMessages } from '@/i18n/messages';

import { CategoryMosaic } from '../blocks/category-mosaic';

const mockPush = jest.fn();
// Electronics has a sub-category; Bags is not in the tree at all.
const mockTree: Category[] = [
  {
    id: 'electronics',
    slug: 'electronics',
    name: 'Electronics',
    children: [{ id: 'audio', slug: 'audio', name: 'Audio', children: [] }],
  },
];

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/features/categories/use-categories', () => ({
  ...jest.requireActual('@/features/categories/use-categories'),
  useCategories: () => ({ data: mockTree }),
}));

function InEnglish({ children }: PropsWithChildren) {
  return (
    <IntlProvider locale="en" messages={getMessages('en')}>
      {children}
    </IntlProvider>
  );
}

describe('CategoryMosaic', () => {
  afterEach(() => mockPush.mockClear());

  it('draws its title and a tile for each category', async () => {
    await render(<CategoryMosaic block={categoryMosaicBlock} />, { wrapper: InEnglish });

    expect(screen.getByText('Explore')).toBeTruthy();
    for (const { name } of categoryMosaicBlock.categories) {
      expect(screen.getByRole('link', { name })).toBeTruthy();
    }
  });

  it('opens the page of a category that has sub-categories', async () => {
    await render(<CategoryMosaic block={categoryMosaicBlock} />, { wrapper: InEnglish });

    await fireEvent.press(screen.getByRole('link', { name: 'Electronics' }));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/categories/[slug]',
      params: { slug: 'electronics' },
    });
  });

  it('opens the products of a category that has none', async () => {
    await render(<CategoryMosaic block={categoryMosaicBlock} />, { wrapper: InEnglish });

    await fireEvent.press(screen.getByRole('link', { name: 'Bags' }));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/products', params: { category: 'bags' } });
  });

  it('draws nothing without categories', async () => {
    await render(<CategoryMosaic block={{ ...categoryMosaicBlock, categories: [] }} />, {
      wrapper: InEnglish,
    });

    expect(screen.toJSON()).toBeNull();
  });
});
