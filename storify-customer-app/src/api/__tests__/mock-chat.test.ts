import {
  API_BASE_PATH,
  CHAT_ATTACHMENT_FORM_FIELDS,
  ChatConversationList,
  ChatDraft,
  ChatMessagePage,
  ChatSendResult,
} from '@/contracts/mobile/shop/v1';

import { mockFetch, resetMockServer } from '../mocks/server';
import { ORIGIN, call, dataOf, signIn } from './mock-helpers';

const ID = '7b0f4a52-3c1e-4d8a-9f3b-2a6c5d4e1f00';

/** POST …/attachments with one file, as a form, the way the app sends it. */
async function sendFile(
  conversation: string,
  file: { bytes: number; type: string; name: string },
  headers: Record<string, string>,
  clientMessageId = ID
) {
  const form = new FormData();
  form.append(CHAT_ATTACHMENT_FORM_FIELDS.clientMessageId, clientMessageId);
  form.append(CHAT_ATTACHMENT_FORM_FIELDS.message, 'Here it is.');
  form.append(
    CHAT_ATTACHMENT_FORM_FIELDS.file,
    new Blob([new Uint8Array(file.bytes)], { type: file.type }),
    file.name
  );
  const response = await mockFetch(
    `${ORIGIN}${API_BASE_PATH}/en/chat/conversations/${conversation}/attachments`,
    { method: 'POST', headers, body: form }
  );
  return { response, body: await response.json() };
}

beforeEach(resetMockServer);

describe('chat', () => {
  it('names each conversation’s seller with their store logo, and the store with none', async () => {
    const { headers } = await signIn();
    const { items } = await dataOf(ChatConversationList, '/chat/conversations', { headers });

    const bySeller = new Map(items.map((item) => [item.seller?.name ?? item.seller?.id, item]));
    expect(bySeller.get('North Trail')?.seller?.logo?.thumb).toMatch(/^https:\/\//);
    expect(bySeller.get('Urban Loft')?.seller?.logo).toBeDefined();
    // A seller whose store is gone has no logo to send, and the store's own thread no seller.
    expect(bySeller.get('vnd_gone')?.seller?.logo).toBeUndefined();
    expect(items.find((item) => item.subject === 'Store support')?.seller).toBeUndefined();
  });

  it('says who will answer about a product, with their logo', async () => {
    const { headers } = await signIn();
    const draft = await dataOf(ChatDraft, '/chat/draft?productId=prod_canvas-weekender-bag', {
      headers,
    });

    expect(draft.seller?.name).toBe('North Trail');
    expect(draft.seller?.logo?.thumb).toMatch(/^https:\/\//);
  });

  it('says what files each conversation that takes replies takes, and none for a closed one', async () => {
    const { headers } = await signIn();
    const { items } = await dataOf(ChatConversationList, '/chat/conversations', { headers });

    for (const item of items) {
      if (item.canReply) expect(item.attachments?.types.length).toBeGreaterThan(0);
      else expect(item.attachments).toBeUndefined();
    }
  });

  it('shares a product as a card, its body the name and link when nothing is written', async () => {
    const { headers } = await signIn();
    const { message } = await dataOf(ChatSendResult, '/chat/conversations/cnv_4/messages', {
      method: 'POST',
      headers,
      body: { message: '', clientMessageId: ID, productId: 'prod_canvas-weekender-bag' },
    });

    expect(message.product).toMatchObject({
      slug: 'canvas-weekender-bag',
      price: { formatted: expect.any(String) },
    });
    expect(message.bodyIsFallback).toBe(true);
    expect(message.body).toContain('/products/canvas-weekender-bag');
  });

  it('refuses to share a product another seller sells, or one the store does not show', async () => {
    const { headers } = await signIn();
    for (const productId of ['prod_everyday-cotton-tee', 'prod_gone']) {
      const { response, body } = await call('/chat/conversations/cnv_4/messages', {
        method: 'POST',
        headers,
        body: { message: 'This one?', clientMessageId: ID, productId },
      });
      expect(response.status).toBe(409);
      expect(body.reason).toBe('PRODUCT_NOT_AVAILABLE');
    }
  });

  it('takes a picture the conversation accepts, once however often it is sent', async () => {
    const { headers } = await signIn();
    const photo = { bytes: 2048, type: 'image/png', name: 'photo.png' };

    const first = await sendFile('cnv_4', photo, headers);
    const again = await sendFile('cnv_4', photo, headers);

    expect(first.response.status).toBe(200);
    const { message } = ChatSendResult.parse(first.body.data);
    expect(message.attachments).toEqual([
      expect.objectContaining({ type: 'image', name: 'photo.png', mimeType: 'image/png' }),
    ]);
    expect(message.body).toBe('Here it is.');
    expect(ChatSendResult.parse(again.body.data).message.id).toBe(message.id);
    const page = await dataOf(ChatMessagePage, '/chat/conversations/cnv_4/messages', { headers });
    expect(page.items.filter((item) => item.clientMessageId === ID)).toHaveLength(1);
  });

  it('refuses a file of a type, or a size, the conversation does not take', async () => {
    const { headers } = await signIn();
    const tooLarge = { bytes: 5 * 1024 * 1024, type: 'image/jpeg', name: 'large.jpg' };
    const notTaken = { bytes: 10, type: 'application/zip', name: 'archive.zip' };

    for (const file of [tooLarge, notTaken]) {
      const { response, body } = await sendFile('cnv_4', file, headers);
      expect(response.status).toBe(400);
      expect(body.reason).toBe('ATTACHMENT_NOT_ACCEPTED');
    }
  });
});
