import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { IntlProvider } from 'use-intl';

import { SEED_CONVERSATIONS, listMessages } from '@/api/mocks/fixtures/chat';
import { getMessages } from '@/i18n/messages';

import type { ChatParties } from '../parties';
import { Thread } from '../thread';

const PARTIES: ChatParties = {
  shopper: { name: 'Nadia', image: undefined },
  store: { icon: undefined },
};

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

describe('a conversation about a product', () => {
  afterEach(() => mockPush.mockClear());

  it('opens the product when its card is tapped', async () => {
    const conversation = SEED_CONVERSATIONS.find((item) => item.product);
    if (!conversation) throw new Error('The mock store has no conversation about a product');
    const page = { items: listMessages(conversation.id), nextCursor: null, conversation };
    await render(<Thread page={page} pending={null} parties={PARTIES} />, { wrapper: InEnglish });

    await fireEvent.press(screen.getByRole('link', { name: 'Open Canvas Weekender Bag' }));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/products/[slug]',
      params: { slug: 'canvas-weekender-bag' },
    });
  });
});
