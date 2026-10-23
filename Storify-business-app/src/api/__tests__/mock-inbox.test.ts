import {
  Conversation,
  ConversationAssignees,
  ConversationList,
  ConversationMessages,
  ConversationReadResult,
  SentMessage,
} from '@/contracts/mobile/biz/v1';

import { receiveMockMessage } from '../mocks/routes/inbox';
import { resetMockServer } from '../mocks/server';
import { as, call, dataOf, keyed, refusalOf } from './mock-helpers';

beforeEach(resetMockServer);

describe('the inbox', () => {
  it("lists the store's conversations for its operators and a seller's for the seller", async () => {
    const store = await dataOf(ConversationList, '/conversations', {
      headers: await as('admin@example.com'),
    });
    expect(store.items.map((conversation) => conversation.id)).toEqual([
      'conv_store_1',
      'conv_store_2',
      'conv_store_3',
    ]);
    expect(store.unreadCount).toBe(2);

    const seller = await dataOf(ConversationList, '/conversations', {
      headers: await as('seller@example.com'),
    });
    expect(seller.items.map((conversation) => conversation.id)).toEqual([
      'conv_green_1',
      'conv_green_2',
    ]);
  });

  it('says when a reply cannot be sent, and why', async () => {
    const admin = await dataOf(ConversationList, '/conversations', {
      headers: await as('admin@example.com'),
    });
    const byId = new Map(admin.items.map((conversation) => [conversation.id, conversation]));
    expect(byId.get('conv_store_1')?.canReply).toBe(true);
    expect(byId.get('conv_store_2')?.canReply).toBe(false);
    expect(byId.get('conv_store_3')?.canReply).toBe(false);

    const viewOnly = await dataOf(ConversationList, '/conversations', {
      headers: await as('staff@example.com'),
    });
    expect(viewOnly.items.every((conversation) => !conversation.canReply)).toBe(true);
  });

  it('pages a thread back in time, newest first', async () => {
    const thread = await dataOf(
      ConversationMessages,
      '/conversations/conv_store_1/messages?limit=2',
      {
        headers: await as('admin@example.com'),
      }
    );
    expect(thread.items.map((message) => message.id)).toEqual(['msg_s1_5', 'msg_s1_4']);
    expect(thread.nextCursor).not.toBeNull();
    expect(thread.conversation.id).toBe('conv_store_1');
  });

  it('sends a reply once per key and refuses one the conversation cannot take', async () => {
    const headers = await as('admin@example.com');
    const send = (id: string, key: string) =>
      call(`/conversations/${id}/messages`, {
        method: 'POST',
        headers: keyed(headers, key),
        body: { body: 'Yes, we gift wrap.' },
      });

    const first = SentMessage.parse((await send('conv_store_1', 'k1')).body.data);
    await send('conv_store_1', 'k1');
    expect(first.conversation.lastMessagePreview).toBe('Yes, we gift wrap.');
    const thread = await dataOf(ConversationMessages, '/conversations/conv_store_1/messages', {
      headers,
    });
    expect(thread.items.filter((message) => message.body === 'Yes, we gift wrap.')).toHaveLength(1);

    expect((await send('conv_store_2', 'k2')).body.reason).toBe('REPLY_WINDOW_CLOSED');
    expect((await send('conv_store_3', 'k3')).body.reason).toBe('CONVERSATION_CLOSED');
  });

  it('offers each operator what they may do to a conversation', async () => {
    const actions = async (email: string) =>
      new Map(
        (await dataOf(ConversationList, '/conversations', { headers: await as(email) })).items.map(
          (conversation) => [conversation.id, conversation.actions]
        )
      );
    const admin = await actions('admin@example.com');
    expect(admin.get('conv_store_1')).toEqual(['note', 'assign', 'claim', 'resolve']);
    expect(admin.get('conv_store_3')).toEqual(['note', 'assign', 'claim']);
    expect((await actions('staff@example.com')).get('conv_store_1')).toEqual([]);
    const sellerStaff = await actions('seller-staff@example.com');
    // Already theirs: nothing to take; no manage permission: no assigning or resolving.
    expect(sellerStaff.get('conv_green_1')).toEqual(['note']);
    expect(sellerStaff.get('conv_green_2')).toEqual(['note', 'claim']);
    expect((await actions('seller@example.com')).get('conv_green_2')).toEqual([
      'note',
      'assign',
      'claim',
      'reopen',
    ]);
  });

  it('keeps a note once per key, as the team’s own, and the lists never show it', async () => {
    const headers = await as('admin@example.com');
    const write = (key: string) =>
      call('/conversations/conv_store_3/notes', {
        method: 'POST',
        headers: keyed(headers, key),
        body: { body: 'Ask about wholesale again in spring.' },
      });
    // A closed conversation takes no reply, but takes a note.
    const first = SentMessage.parse((await write('n1')).body.data);
    await write('n1');
    expect(first.message).toMatchObject({ direction: 'internal', senderName: 'Amina Rahman' });
    expect(first.conversation.lastMessagePreview).toBe('Not at the moment, sorry.');
    const thread = await dataOf(ConversationMessages, '/conversations/conv_store_3/messages', {
      headers,
    });
    expect(thread.items.filter((message) => message.direction === 'internal')).toHaveLength(1);

    await refusalOf(403, 'AUTHORIZATION_ERROR', '/conversations/conv_store_1/notes', {
      method: 'POST',
      headers: keyed(await as('staff@example.com'), 'n2'),
      body: { body: 'Not mine to write' },
    });
  });

  it('assigns a conversation within its team, and to nobody', async () => {
    const headers = await as('seller@example.com');
    const team = await dataOf(ConversationAssignees, '/conversations/conv_green_2/assignees', {
      headers,
    });
    expect(team.items.map((person) => person.id)).toEqual([
      'user_seller',
      'user_seller_staff',
      'user_both',
    ]);
    const put = (assigneeId: string | null, who: Record<string, string> = headers) =>
      call('/conversations/conv_green_2/assignment', {
        method: 'PUT',
        headers: who,
        body: { assigneeId },
      });
    const given = Conversation.parse((await put('user_seller_staff')).body.data);
    expect(given.assignee).toEqual({ id: 'user_seller_staff', name: 'Rafi Ahmed' });
    expect((await put('user_admin')).body.reason).toBe('ASSIGNEE_NOT_AVAILABLE');
    expect(Conversation.parse((await put(null)).body.data).assignee).toBeUndefined();

    // A seller's staff takes it themselves, and only that.
    const staff = await as('seller-staff@example.com');
    expect((await put('user_seller', staff)).response.status).toBe(403);
    expect(Conversation.parse((await put('user_seller_staff', staff)).body.data).actions).toEqual([
      'note',
    ]);
    await refusalOf(403, 'AUTHORIZATION_ERROR', '/conversations/conv_green_2/assignees', {
      headers: staff,
    });

    const mine = await dataOf(ConversationList, '/conversations?assignee=me', { headers: staff });
    expect(mine.items.map((conversation) => conversation.id)).toEqual([
      'conv_green_1',
      'conv_green_2',
    ]);
    const nobodys = await dataOf(ConversationList, '/conversations?assignee=none', { headers });
    expect(nobodys.items).toEqual([]);
  });

  it('resolves and reopens a conversation, only from where each step starts', async () => {
    const headers = await as('admin@example.com');
    const put = (id: string, status: string) =>
      call(`/conversations/${id}/status`, { method: 'PUT', headers, body: { status } });
    expect(Conversation.parse((await put('conv_store_1', 'resolved')).body.data)).toMatchObject({
      status: 'resolved',
      actions: ['note', 'assign', 'claim', 'reopen'],
    });
    expect(Conversation.parse((await put('conv_store_1', 'resolved')).body.data).status).toBe(
      'resolved'
    );
    expect(Conversation.parse((await put('conv_store_1', 'open')).body.data).status).toBe('open');
    expect((await put('conv_store_3', 'open')).body.reason).toBe('STATUS_CHANGE_NOT_ALLOWED');
    expect((await put('conv_store_1', 'closed')).response.status).toBe(400);
    await refusalOf(403, 'AUTHORIZATION_ERROR', '/conversations/conv_green_1/status', {
      method: 'PUT',
      headers: await as('seller-staff@example.com'),
      body: { status: 'resolved' },
    });
  });

  it('marks a thread read and answers the unread left', async () => {
    const headers = await as('admin@example.com');
    receiveMockMessage('conv_store_3', 'One more question');
    const read = await dataOf(ConversationReadResult, '/conversations/conv_store_1/read', {
      method: 'POST',
      headers,
    });
    expect(read.unreadCount).toBe(1);
  });
});
