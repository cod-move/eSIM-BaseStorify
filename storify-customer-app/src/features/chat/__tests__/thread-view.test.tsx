// The picture viewer's gestures, on the stand-ins the package ships for tests.
import 'react-native-gesture-handler/jestSetup';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { launchImageLibraryAsync, type ImagePickerResult } from 'expo-image-picker';
import { openBrowserAsync } from 'expo-web-browser';
import type { PropsWithChildren } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { IntlProvider } from 'use-intl';

import { ApiError } from '@/api/errors';
import { CHAT_ATTACHMENT_POLICY, SEED_CONVERSATIONS } from '@/api/mocks/fixtures/chat';
import { resetMockServer } from '@/api/mocks/server';
import type { ChatMessage, ChatMessagePage } from '@/contracts/mobile/shop/v1';
import * as wishlist from '@/features/wishlist/use-wishlist';
import { getMessages } from '@/i18n/messages';

import type { ChatParties } from '../parties';
import { Thread } from '../thread';
import { Composer } from '../thread-composer';
import { ThreadHeader } from '../thread-header';
import { pictureUris } from './pictures';

const FRAME = { x: 0, y: 0, width: 390, height: 844 };
const NO_INSETS = { top: 0, left: 0, right: 0, bottom: 0 };
const NOW = new Date('2026-10-05T12:00:00Z');
const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, canGoBack: () => true, replace: jest.fn() }),
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));

const PARTIES: ChatParties = {
  shopper: { name: 'Nadia', image: undefined },
  store: { icon: undefined },
};

const STORE_ICON = {
  thumb: 'https://img.example.com/store-icon-thumb.png',
  card: 'https://img.example.com/store-icon-card.png',
  full: 'https://img.example.com/store-icon-full.png',
};

/** A fresh cache per test: a shared product's card reads its page from the mock store. */
let client = new QueryClient();
beforeEach(() => {
  resetMockServer();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
// A shared product's card reads its page after the test has looked at it: let
// that read land inside the test, then leave nothing waiting when Jest ends.
afterEach(async () => {
  await waitFor(() => expect(client.isFetching()).toBe(0));
  // The cache tells the card on its next tick.
  await act(() => new Promise((done) => setTimeout(done, 0)));
  client.clear();
});

function InEnglish({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={{ frame: FRAME, insets: NO_INSETS }}>
        <IntlProvider locale="en" timeZone="UTC" now={NOW} messages={getMessages('en')}>
          {children}
        </IntlProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

function message(id: string, fromShopper: boolean, body: string, createdAt: string): ChatMessage {
  return {
    id,
    fromShopper,
    senderName: fromShopper ? 'Nadia' : 'North Trail',
    body,
    attachments: [],
    createdAt,
  };
}

const CONVERSATION = SEED_CONVERSATIONS.find((item) => item.seller) ?? SEED_CONVERSATIONS[0]!;

/** Newest first, as the store sends them: two days ago, yesterday (twice by the shopper), today. */
const PAGE: ChatMessagePage = {
  items: [
    message('m4', false, 'It is on its way.', '2026-10-05T08:00:00Z'),
    message('m3', true, 'Second line.', '2026-10-04T09:05:00Z'),
    message('m2', true, 'First line.', '2026-10-04T09:00:00Z'),
    message('m1', false, 'Hello, how can I help?', '2026-10-03T10:00:00Z'),
  ],
  nextCursor: null,
  conversation: { ...CONVERSATION, product: undefined },
};

afterEach(() => {
  mockBack.mockClear();
  mockPush.mockClear();
});

describe('the messages of a conversation', () => {
  it('puts a heading above each day: a date, Yesterday, Today', async () => {
    await render(<Thread page={PAGE} pending={null} parties={PARTIES} />, { wrapper: InEnglish });

    expect(screen.getByText('Oct 3, 2026')).toBeTruthy();
    expect(screen.getByText('Yesterday')).toBeTruthy();
    expect(screen.getByText('Today')).toBeTruthy();
  });

  it('gives a run of messages from one side one time, under the last of them', async () => {
    await render(<Thread page={PAGE} pending={null} parties={PARTIES} />, { wrapper: InEnglish });

    expect(screen.getByText(/^9:05\sAM$/)).toBeTruthy();
    expect(screen.queryByText(/^9:00\sAM$/)).toBeNull();
    expect(screen.getByText(/^10:00\sAM$/)).toBeTruthy();
    expect(screen.getByText(/^8:00\sAM$/)).toBeTruthy();
  });

  it("puts the seller's logo beside their messages", async () => {
    await render(<Thread page={PAGE} pending={null} parties={PARTIES} />, { wrapper: InEnglish });

    // One for each run of the seller's messages; the shopper has no picture here.
    expect(pictureUris()).toEqual([
      CONVERSATION.seller!.logo!.thumb,
      CONVERSATION.seller!.logo!.thumb,
    ]);
  });

  it('starts a new run when one side writes again after a pause', async () => {
    const page: ChatMessagePage = {
      ...PAGE,
      items: [
        message('m3', true, 'Much later.', '2026-10-05T09:50:00Z'),
        message('m2', true, 'Right after.', '2026-10-05T09:02:00Z'),
        message('m1', true, 'Hello.', '2026-10-05T09:00:00Z'),
      ],
    };
    await render(<Thread page={page} pending={null} parties={PARTIES} />, { wrapper: InEnglish });

    // The first two run together, under one time; the third, 48 minutes on, has its own.
    expect(screen.queryByText(/^9:00\sAM$/)).toBeNull();
    expect(screen.getByText(/^9:02\sAM$/)).toBeTruthy();
    expect(screen.getByText(/^9:50\sAM$/)).toBeTruthy();
  });

  it('shows what came with a message: a picture, and a file to open', async () => {
    const withFiles: ChatMessage = {
      ...message('m5', false, 'Here you go.', '2026-10-05T10:00:00Z'),
      attachments: [
        { type: 'image', url: 'https://img.example.com/photo.jpg', name: 'photo.jpg' },
        {
          type: 'document',
          url: 'https://files.example.com/size-guide.pdf',
          name: 'size-guide.pdf',
        },
      ],
    };
    await render(
      <Thread
        page={{ ...PAGE, items: [withFiles, ...PAGE.items] }}
        pending={null}
        parties={PARTIES}
      />,
      { wrapper: InEnglish }
    );

    expect(screen.getByRole('link', { name: 'Open size-guide.pdf' })).toBeTruthy();

    // The picture opens full screen in the app, not in the browser.
    expect(screen.queryByTestId('image-viewer-page')).toBeNull();
    await fireEvent.press(screen.getByRole('imagebutton', { name: 'Open the picture' }));
    expect(screen.getByTestId('image-viewer-page')).toBeTruthy();
    expect(openBrowserAsync).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Close picture' }));
    expect(screen.queryByTestId('image-viewer-page')).toBeNull();
  });

  it('draws a shared product as a card in place of its fallback text, and opens it', async () => {
    const usd = (amount: number, formatted: string) => ({ amount, currency: 'USD', formatted });
    const shared: ChatMessage = {
      ...message(
        'm5',
        false,
        'Canvas Weekender Bag\nhttps://shop.example.com/products/canvas-weekender-bag',
        '2026-10-05T10:00:00Z'
      ),
      product: {
        id: 'prod_canvas',
        slug: 'canvas-weekender-bag',
        name: 'Canvas Weekender Bag',
        variantName: 'Olive',
        price: usd(89, '$89.00'),
        compareAtPrice: usd(110, '$110.00'),
      },
      bodyIsFallback: true,
    };
    await render(
      <Thread
        page={{ ...PAGE, items: [shared, ...PAGE.items] }}
        pending={null}
        parties={PARTIES}
      />,
      { wrapper: InEnglish }
    );

    expect(screen.getByText('Canvas Weekender Bag')).toBeTruthy();
    expect(screen.getByText('Olive')).toBeTruthy();
    expect(screen.getByText('$89.00')).toBeTruthy();
    expect(screen.getByText('$110.00')).toBeTruthy();
    expect(screen.queryByText(/products\/canvas-weekender-bag/)).toBeNull();

    await fireEvent.press(screen.getByRole('link', { name: 'Open Canvas Weekender Bag' }));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/products/[slug]',
      params: { slug: 'canvas-weekender-bag' },
    });
  });

  it('keeps the text written beside a shared product', async () => {
    const shared: ChatMessage = {
      ...message('m5', true, 'Is this one in stock?', '2026-10-05T10:00:00Z'),
      product: { id: 'prod_canvas', slug: 'canvas-weekender-bag', name: 'Canvas Weekender Bag' },
    };
    await render(
      <Thread
        page={{ ...PAGE, items: [shared, ...PAGE.items] }}
        pending={null}
        parties={PARTIES}
      />,
      { wrapper: InEnglish }
    );

    expect(screen.getByText('Is this one in stock?')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Canvas Weekender Bag' })).toBeTruthy();
  });

  it('adds a shared product to the cart from its card, with its rating and today’s price', async () => {
    const addFromCard = jest.fn();
    const spy = jest
      .spyOn(wishlist, 'useAddFromCard')
      .mockReturnValue({ add: addFromCard, busyProductId: undefined });
    const shared: ChatMessage = {
      ...message('m5', false, '', '2026-10-05T10:00:00Z'),
      product: {
        id: 'prod_canvas-weekender-bag',
        slug: 'canvas-weekender-bag',
        name: 'Canvas weekender bag',
      },
    };
    await render(
      <Thread
        page={{ ...PAGE, items: [shared, ...PAGE.items] }}
        pending={null}
        parties={PARTIES}
      />,
      { wrapper: InEnglish }
    );

    const add = await screen.findByRole('button', { name: 'Add to Cart' });
    expect(screen.getByText('4.6')).toBeTruthy();
    expect(screen.getByText('$120.00')).toBeTruthy();

    // The card's button is a product card's: it hands the product to the same "add from a card".
    await fireEvent.press(add);
    expect(addFromCard).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'canvas-weekender-bag', requiresVariantChoice: false })
    );
    spy.mockRestore();
  });

  it('names the options a shared product comes in, and asks for one before the cart', async () => {
    const shared: ChatMessage = {
      ...message('m5', false, '', '2026-10-05T10:00:00Z'),
      product: {
        id: 'prod_phone-ultra-sparse-variants',
        slug: 'phone-ultra-sparse-variants',
        name: 'Ultra Phone',
      },
    };
    await render(
      <Thread
        page={{ ...PAGE, items: [shared, ...PAGE.items] }}
        pending={null}
        parties={PARTIES}
      />,
      { wrapper: InEnglish }
    );

    await fireEvent.press(await screen.findByRole('button', { name: 'Choose options' }));
    expect(screen.getByText('Black · Silver')).toBeTruthy();
    expect(screen.getByText('256 GB · 512 GB')).toBeTruthy();
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/products/[slug]',
      params: { slug: 'phone-ultra-sparse-variants' },
    });
  });

  it('shows a photo on its way from the phone, marked as sending', async () => {
    await render(
      <Thread
        page={PAGE}
        pending={{
          body: '',
          attachment: {
            kind: 'file',
            file: { uri: 'file:///photos/1.jpg', name: '1.jpg', type: 'image/jpeg' },
          },
        }}
        parties={PARTIES}
      />,
      { wrapper: InEnglish }
    );

    expect(pictureUris()).toContain('file:///photos/1.jpg');
    expect(screen.getByText('Sending…')).toBeTruthy();
  });

  it('shows the message on its way, marked as sending', async () => {
    await render(<Thread page={PAGE} pending={{ body: 'On my way' }} parties={PARTIES} />, {
      wrapper: InEnglish,
    });

    expect(screen.getByText('On my way')).toBeTruthy();
    expect(screen.getByText('Sending…')).toBeTruthy();
  });
});

describe('the header of a conversation', () => {
  it('names who it is with and what about, and goes back', async () => {
    await render(<ThreadHeader conversation={PAGE.conversation} parties={PARTIES} />, {
      wrapper: InEnglish,
    });

    expect(screen.getByText('North Trail')).toBeTruthy();
    expect(screen.getByText(PAGE.conversation.subject)).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('pictures the seller by their logo', async () => {
    await render(<ThreadHeader conversation={PAGE.conversation} parties={PARTIES} />, {
      wrapper: InEnglish,
    });

    expect(pictureUris()).toEqual([CONVERSATION.seller!.logo!.thumb]);
  });

  it('pictures the store by its square icon, or by the first letter of its name without one', async () => {
    const store = { ...PAGE.conversation, seller: undefined };
    const { unmount } = await render(
      <ThreadHeader conversation={store} parties={{ ...PARTIES, store: { icon: STORE_ICON } }} />,
      { wrapper: InEnglish }
    );
    expect(pictureUris()).toEqual([STORE_ICON.thumb]);
    await unmount();

    await render(<ThreadHeader conversation={store} parties={PARTIES} />, { wrapper: InEnglish });
    expect(pictureUris()).toEqual([]);
    expect(screen.getByText('T')).toBeTruthy();
  });
});

describe('the composer', () => {
  it('cannot send while the field is empty, and sends what was written', async () => {
    const onSend = jest.fn().mockResolvedValue(true);
    await render(<Composer onSend={onSend} error={null} />, { wrapper: InEnglish });

    const send = screen.getByRole('button', { name: 'Send message' });
    expect(send.props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByLabelText('Your message'), 'Is it in stock?');
    expect(
      screen.getByRole('button', { name: 'Send message' }).props.accessibilityState.disabled
    ).toBe(false);

    await fireEvent.press(screen.getByRole('button', { name: 'Send message' }));
    expect(onSend).toHaveBeenCalledWith('Is it in stock?', undefined);
  });

  it('refuses a photo of a type the conversation does not take, before anything is sent', async () => {
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///photos/1.heic',
          fileName: '1.heic',
          mimeType: 'image/heic',
          fileSize: 1000,
          width: 100,
          height: 100,
        },
      ],
    } as ImagePickerResult);
    const onSend = jest.fn().mockResolvedValue(true);
    await render(<Composer onSend={onSend} error={null} policy={CHAT_ATTACHMENT_POLICY} />, {
      wrapper: InEnglish,
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Add a photo, a file or a product' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Choose a photo' }));

    expect(
      await screen.findByText("This conversation doesn't take this kind of file.")
    ).toBeTruthy();
    // The sheet has gone, and nothing was added to the message.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Choose a photo' })).toBeNull()
    );
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Send message' }).props.accessibilityState.disabled
    ).toBe(true);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('offers only a product where the conversation takes no files', async () => {
    await render(<Composer onSend={jest.fn()} error={null} />, { wrapper: InEnglish });

    await fireEvent.press(screen.getByRole('button', { name: 'Add a photo, a file or a product' }));

    expect(await screen.findByRole('button', { name: 'Share a product' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Choose a photo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Take a photo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Choose a file' })).toBeNull();
  });

  it('words the refusal of a file or a product in the app, and other chat refusals in the store’s words', async () => {
    const refused = (reason: string, message: string) =>
      new ApiError(409, 'CONFLICT', message, { reason });
    const { rerender } = await render(
      <Composer onSend={jest.fn()} error={refused('PRODUCT_NOT_AVAILABLE', 'Not here.')} />,
      { wrapper: InEnglish }
    );
    expect(
      screen.getByText(
        "This product can't be shared here. It may be gone, or sold by another seller."
      )
    ).toBeTruthy();

    await rerender(
      <Composer onSend={jest.fn()} error={refused('ATTACHMENT_NOT_ACCEPTED', 'Not this file.')} />
    );
    expect(screen.getByRole('alert').props.children).toMatch(
      /^This conversation doesn't take this file/
    );

    await rerender(
      <Composer
        onSend={jest.fn()}
        error={refused('CONVERSATION_CLOSED', 'The store closed this conversation.')}
      />
    );
    expect(screen.getByText('The store closed this conversation.')).toBeTruthy();
  });
});
