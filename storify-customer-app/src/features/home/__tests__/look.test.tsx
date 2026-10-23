import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { lookBlock } from '@/api/mocks/fixtures/home-story-blocks';
import { getMessages } from '@/i18n/messages';

import { Look } from '../blocks/look';

const mockPush = jest.fn();
const mockOpenLink = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/features/config/use-open-link', () => ({ useOpenLink: () => mockOpenLink }));

function InEnglish({ children }: PropsWithChildren) {
  return (
    <IntlProvider locale="en" messages={getMessages('en')}>
      {children}
    </IntlProvider>
  );
}

describe('Look', () => {
  afterEach(() => {
    mockPush.mockClear();
    mockOpenLink.mockClear();
  });

  it('draws its title, its subtitle and a tag for each piece in it', async () => {
    await render(<Look block={lookBlock} />, { wrapper: InEnglish });

    expect(screen.getByText('Weekend look')).toBeTruthy();
    expect(screen.getByText('Three pieces that go together')).toBeTruthy();
    for (const product of lookBlock.products) {
      expect(screen.getByRole('link', { name: product.name })).toBeTruthy();
    }
  });

  it('opens the product whose tag is tapped', async () => {
    const [first] = lookBlock.products;
    await render(<Look block={lookBlock} />, { wrapper: InEnglish });

    await fireEvent.press(screen.getByRole('link', { name: first!.name }));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/products/[slug]',
      params: { slug: first!.slug },
    });
  });

  it('opens the look as a collection when its picture is tapped', async () => {
    await render(<Look block={lookBlock} />, { wrapper: InEnglish });

    await fireEvent.press(screen.getByRole('link', { name: 'Open the look Weekend' }));

    expect(mockOpenLink).toHaveBeenCalledWith('/collections/weekend');
  });
});
