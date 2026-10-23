import { launchImageLibraryAsync, type ImagePickerResult } from 'expo-image-picker';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import * as chatEndpoints from '@/api/endpoints/chat';
import { findConversation, listMessages, sendMessage } from '@/api/mocks/fixtures/chat';
import { MOCK_PASSWORD } from '@/api/mocks/server';
import { goTo, openApp } from '@/__tests__/helpers';
import { authClient } from '@/lib/auth-client';

jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));

/** Opens one of the shopper's conversations, signed in, and waits for its field. */
async function openConversation(id: string) {
  await openApp('/');
  await act(async () => {
    await authClient.signIn.email({ email: 'nadia@example.com', password: MOCK_PASSWORD });
  });
  await goTo(`/account/inbox/${id}`);
  await screen.findByLabelText('Your message');
}

afterEach(() => jest.restoreAllMocks());

describe('asking the seller from the product page', () => {
  it('sends the question once and opens the conversation in Messages', async () => {
    const start = jest.spyOn(chatEndpoints, 'startChat');
    const app = await openApp('/products/leather-card-holder');
    await act(async () => {
      await authClient.signIn.email({ email: 'nadia@example.com', password: MOCK_PASSWORD });
    });

    await fireEvent.press(await screen.findByRole('button', { name: /^Ask / }));
    await fireEvent.changeText(
      await screen.findByLabelText(/^Your question/),
      'Does it come in black?'
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(app.pathname()).toMatch(/^\/account\/inbox\/.+/));
    expect(start).toHaveBeenCalledTimes(1);
    const [, body] = start.mock.calls[0]!;
    expect(body).toMatchObject({ message: 'Does it come in black?' });
    expect(body.productId).toEqual(expect.any(String));
    const id = app.pathname().split('/').pop() ?? '';
    expect(listMessages(id).map((message) => message.body)).toContain('Does it come in black?');
    // The conversation's field sits where the tab bar would: the bar steps aside.
    await waitFor(() => expect(screen.queryByRole('tab', { name: 'Search' })).toBeNull());
  });

  it('sends a guest to sign in first', async () => {
    const app = await openApp('/products/leather-card-holder');

    await fireEvent.press(await screen.findByRole('button', { name: /^Ask / }));

    await waitFor(() => expect(app.pathname()).toBe('/login'));
  });
});

describe('sharing in a conversation', () => {
  it('shares a product found by its name, and shows it as its card', async () => {
    const send = jest.spyOn(chatEndpoints, 'sendChatMessage');
    await openConversation('cnv_4');
    await fireEvent.press(screen.getByRole('button', { name: 'Add a photo, a file or a product' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Share a product' }));
    await fireEvent.changeText(await screen.findByLabelText('Search products'), 'canvas');
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Share Canvas weekender bag' })
    );
    expect(await screen.findByRole('button', { name: 'Remove Canvas weekender bag' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() =>
      expect(listMessages('cnv_4')[0]).toMatchObject({
        product: { slug: 'canvas-weekender-bag' },
        bodyIsFallback: true,
      })
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![2]).toMatchObject({
      message: '',
      productId: 'prod_canvas-weekender-bag',
    });
    expect(await screen.findByRole('link', { name: 'Open Canvas weekender bag' })).toBeTruthy();
    // The body is the product's name and link for readers without cards: not shown here.
    expect(screen.queryByText(/\/products\/canvas-weekender-bag/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
  });

  it('sends a photo from the library with what was written, and shows it', async () => {
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///photos/1.jpg',
          fileName: '1.jpg',
          mimeType: 'image/jpeg',
          fileSize: 200_000,
          width: 1200,
          height: 900,
        },
      ],
    } as ImagePickerResult);
    // Jest's FormData is the browser's, which cannot carry a phone's file by its
    // address: the store stores the message as its attachments route would
    // (that route is held to the contract in mock-chat.test.ts).
    const upload = jest
      .spyOn(chatEndpoints, 'sendChatAttachment')
      .mockImplementation(async (_locale, id, request) => {
        const conversation = findConversation(id)!;
        const message = sendMessage(
          conversation,
          request.message,
          request.clientMessageId,
          'Nadia',
          {
            attachments: [
              {
                type: 'image',
                url: request.file.uri,
                name: request.file.name,
                mimeType: request.file.type,
              },
            ],
          }
        );
        return { conversation, message };
      });
    await openConversation('cnv_4');

    await fireEvent.press(screen.getByRole('button', { name: 'Add a photo, a file or a product' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Choose a photo' }));
    expect(await screen.findByRole('button', { name: 'Remove 1.jpg' })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Your message'), 'The strap broke.');
    await fireEvent.press(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByRole('imagebutton', { name: 'Open the picture' })).toBeTruthy();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0]![2]).toEqual({
      file: { uri: 'file:///photos/1.jpg', name: '1.jpg', type: 'image/jpeg' },
      message: 'The strap broke.',
      clientMessageId: expect.any(String),
    });
    expect(screen.getByText('The strap broke.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove 1.jpg' })).toBeNull();
  });
});
