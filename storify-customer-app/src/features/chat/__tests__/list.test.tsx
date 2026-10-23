import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { IntlProvider } from 'use-intl';

import { SEED_CONVERSATIONS } from '@/api/mocks/fixtures/chat';
import type { ImageSet } from '@/contracts/mobile/shop/v1';
import { getMessages } from '@/i18n/messages';

import { ConversationList } from '../list';
import type { ChatParties } from '../parties';
import { pictureUris } from './pictures';

const PARTIES: ChatParties = {
  shopper: { name: 'Nadia', image: undefined },
  store: { icon: undefined },
};

const ICON: ImageSet = {
  thumb: 'https://img.example.com/store-icon-thumb.png',
  card: 'https://img.example.com/store-icon-card.png',
  full: 'https://img.example.com/store-icon-full.png',
};

/** The thumbnails of the sellers' logos in the seed conversations. */
const SELLER_LOGOS = SEED_CONVERSATIONS.flatMap((item) =>
  item.seller?.logo ? [item.seller.logo.thumb] : []
);

const FRAME = { x: 0, y: 0, width: 390, height: 844 };
const NO_INSETS = { top: 0, left: 0, right: 0, bottom: 0 };
const mockPush = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

function InEnglish({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: FRAME, insets: NO_INSETS }}>
      <IntlProvider locale="en" timeZone="UTC" messages={getMessages('en')}>
        {children}
      </IntlProvider>
    </SafeAreaProvider>
  );
}

describe('the list of conversations', () => {
  afterEach(() => mockPush.mockClear());

  it('names who each is with, and marks only the ones with unread messages', async () => {
    await render(<ConversationList items={SEED_CONVERSATIONS} parties={PARTIES} />, {
      wrapper: InEnglish,
    });

    const withSeller = screen.getByRole('button', { name: /^North Trail, 2 unread messages, / });
    expect(withSeller).toBeTruthy();
    expect(screen.getByRole('button', { name: /^The store, 1 unread message, / })).toBeTruthy();
    // No unread, so the label goes straight from the name to the last message.
    expect(screen.getByRole('button', { name: /^Urban Loft, Thank you/ })).toBeTruthy();
    // A seller whose store is gone is named generically.
    expect(screen.getByRole('button', { name: /^Seller, This conversation/ })).toBeTruthy();
  });

  it('pictures a seller by their logo and the store by its icon, never the product', async () => {
    await render(
      <ConversationList
        items={SEED_CONVERSATIONS}
        parties={{ ...PARTIES, store: { icon: ICON } }}
      />,
      { wrapper: InEnglish }
    );

    expect(SELLER_LOGOS).toHaveLength(2);
    expect([...pictureUris()].sort()).toEqual([...SELLER_LOGOS, ICON.thumb].sort());
    // A seller with no logo, here one whose store is gone, has the first letter of "Seller".
    expect(screen.getByText('S')).toBeTruthy();
  });

  it('shows the first letter when the store has no icon, not its wide logo', async () => {
    await render(<ConversationList items={SEED_CONVERSATIONS} parties={PARTIES} />, {
      wrapper: InEnglish,
    });

    expect([...pictureUris()].sort()).toEqual([...SELLER_LOGOS].sort());
    expect(screen.getByText('T')).toBeTruthy();
  });

  it('opens the conversation that is tapped', async () => {
    await render(<ConversationList items={SEED_CONVERSATIONS} parties={PARTIES} />, {
      wrapper: InEnglish,
    });

    await fireEvent.press(screen.getByRole('button', { name: /^Urban Loft, / }));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/account/inbox/[id]',
      params: { id: 'cnv_2' },
    });
  });
});
