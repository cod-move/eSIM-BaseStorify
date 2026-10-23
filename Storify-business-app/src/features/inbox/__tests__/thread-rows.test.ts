import { ApiError, NetworkError } from '@/api/errors';
import type { ConversationMessage } from '@/contracts/mobile/biz/v1';

import { threadRows, unsettledReplies, type PendingReply } from '../thread-rows';

const day = (date: number, hour: number, minute = 0) =>
  new Date(2026, 9, date, hour, minute).toISOString();

function message(
  id: string,
  createdAt: string,
  direction: 'inbound' | 'outbound' | 'internal',
  senderName = direction === 'inbound' ? 'Rina Begum' : 'Amina Rahman',
  senderType = direction === 'inbound' ? 'customer' : 'admin'
): ConversationMessage {
  return {
    id,
    direction,
    senderType,
    senderName,
    body: id,
    attachments: [],
    deliveryStatus: 'delivered',
    createdAt,
  };
}

/** What the rows are, top of the list first (they come newest first, for a list drawn upside down). */
function shape(rows: ReturnType<typeof threadRows>): string[] {
  return rows
    .map((row) =>
      row.kind === 'day'
        ? `day ${new Date(row.at).getDate()}`
        : row.kind === 'pending'
          ? `pending ${row.reply.body}`
          : `${row.message.id}${row.firstOfRun ? ' (first)' : ''}`
    )
    .reverse();
}

describe('the rows of a thread', () => {
  it('puts each day’s separator above its first message, oldest at the top', () => {
    const rows = threadRows(
      [
        message('m3', day(5, 9), 'inbound'),
        message('m2', day(4, 18), 'outbound'),
        message('m1', day(4, 9), 'inbound'),
      ],
      []
    );

    expect(shape(rows)).toEqual(['day 4', 'm1 (first)', 'm2 (first)', 'day 5', 'm3 (first)']);
  });

  it('names the team’s sender once per run, again after another sender or another day', () => {
    const rows = threadRows(
      [
        message('m5', day(5, 9), 'outbound'),
        message('m4', day(4, 13), 'outbound', 'Sadia Karim', 'staff'),
        message('m3', day(4, 12), 'internal'),
        message('m2', day(4, 10, 2), 'outbound'),
        message('m1', day(4, 10), 'outbound'),
      ],
      []
    );

    expect(shape(rows)).toEqual([
      'day 4',
      'm1 (first)',
      'm2',
      // A note is not a reply: it starts its own run.
      'm3 (first)',
      'm4 (first)',
      'day 5',
      'm5 (first)',
    ]);
  });

  it('starts a new run when one sender writes again after a pause', () => {
    const rows = threadRows(
      [
        message('m3', day(4, 13, 49), 'outbound'),
        message('m2', day(4, 13, 2), 'outbound'),
        message('m1', day(4, 13), 'outbound'),
      ],
      []
    );

    // m2 follows m1 within minutes; m3 comes 47 minutes later, with its own name and time.
    expect(shape(rows)).toEqual(['day 4', 'm1 (first)', 'm2', 'm3 (first)']);
    expect(rows.filter((row) => row.kind === 'message' && row.lastOfRun).length).toBe(2);
  });

  it('ends a run at a product shared on its own: what follows has the picture again', () => {
    const card: ConversationMessage = {
      ...message('m2', day(4, 13, 1), 'outbound'),
      body: 'Ceramic bud vase\nhttps://shop.example.com/products/vase',
      product: { id: 'prod_vase', name: 'Ceramic bud vase' },
      bodyIsFallback: true,
    };
    const rows = threadRows(
      [message('m3', day(4, 13, 2), 'outbound'), card, message('m1', day(4, 13), 'outbound')],
      []
    );

    // The card continues m1's run and ends it, with its own time; m3 starts the next one.
    expect(shape(rows)).toEqual(['day 4', 'm1 (first)', 'm2', 'm3 (first)']);
    const ends = rows.filter((row) => row.kind === 'message' && row.lastOfRun);
    expect(ends.map((row) => row.key)).toEqual(['m3', 'm2']);
  });

  it('puts the replies on their way under the newest message, in the order they were sent', () => {
    const pending: PendingReply[] = [
      { localId: 'a', body: 'first', createdAt: day(5, 10), failed: false },
      { localId: 'b', body: 'second', createdAt: day(5, 11), failed: true },
    ];
    const rows = threadRows([message('m1', day(5, 9), 'inbound')], pending);

    expect(shape(rows)).toEqual(['day 5', 'm1 (first)', 'pending first', 'pending second']);
    expect(rows.map((row) => row.key)).toEqual(
      expect.arrayContaining(['pending-a', 'pending-b', 'm1'])
    );
  });

  it('gives every row a key of its own', () => {
    const rows = threadRows(
      [message('m2', day(5, 9), 'inbound'), message('m1', day(4, 9), 'inbound')],
      [{ localId: 'x', body: 'x', createdAt: day(5, 10), failed: false }]
    );
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });
});

describe('the replies still to show', () => {
  // The thread as the store holds it, newest first: a message's `body` is its id here.
  const stored = (id: string, createdAt: string, body = id): ConversationMessage => ({
    ...message(id, createdAt, 'outbound'),
    body,
  });
  // No answer came: the store may have it.
  const reply = (
    localId: string,
    body: string,
    after?: string,
    error: unknown = new NetworkError('timeout')
  ): PendingReply => ({
    localId,
    body,
    createdAt: day(5, 12),
    ...(after ? { after } : {}),
    failed: true,
    error,
  });

  it('settles one the store holds: its answer was lost, the reply was not', () => {
    const messages = [stored('m2', day(5, 12), 'Two vases, then.'), stored('m1', day(5, 9))];
    expect(unsettledReplies(messages, [reply('a', 'Two vases, then.', day(5, 9))], [])).toEqual([]);
  });

  it('keeps one whose words the store holds only from before it was sent', () => {
    const messages = [stored('m1', day(5, 9), 'OK')];
    expect(unsettledReplies(messages, [reply('a', 'OK', day(5, 9))], [])).toHaveLength(1);
  });

  it('settles one reply per stored message: the same words sent twice stay two', () => {
    const messages = [stored('m2', day(5, 12), 'OK'), stored('m1', day(5, 9))];
    const pending = [reply('a', 'OK', day(5, 9)), reply('b', 'OK', day(5, 9))];
    expect(unsettledReplies(messages, pending, []).map((entry) => entry.localId)).toEqual(['b']);
  });

  it('never settles one by the copy of another reply, named by that reply’s answer', () => {
    // "OK" sent twice: the first was stored as m2 and answered; the second never arrived.
    const messages = [stored('m2', day(5, 12), 'OK'), stored('m1', day(5, 9))];
    expect(unsettledReplies(messages, [reply('b', 'OK', day(5, 9))], ['m2'])).toHaveLength(1);
  });

  it('settles only one that failed with no answer: not one still on its way, nor one refused', () => {
    const messages = [stored('m2', day(5, 12), 'OK'), stored('m1', day(5, 9))];
    const sending = { ...reply('a', 'OK', day(5, 9)), failed: false, error: undefined };
    const refused = reply('b', 'OK', day(5, 9), new ApiError(409, 'CONFLICT', '', {}));
    const busy = reply('c', 'OK', day(5, 9), new ApiError(503, 'SERVICE_UNAVAILABLE', ''));
    const inProgress = reply('d', 'OK', day(5, 9), new ApiError(409, 'REQUEST_IN_PROGRESS', ''));

    expect(unsettledReplies(messages, [sending], [])).toHaveLength(1);
    expect(unsettledReplies(messages, [refused], [])).toHaveLength(1);
    expect(unsettledReplies(messages, [busy], [])).toEqual([]);
    expect(unsettledReplies(messages, [inProgress], [])).toEqual([]);
  });

  it('never settles one by a colleague’s message with the same words', () => {
    const messages = [
      { ...stored('m2', day(5, 12), 'OK'), senderId: 'user_staff', senderName: 'Sadia Karim' },
    ];
    const pending = [reply('a', 'OK', day(5, 9))];
    expect(unsettledReplies(messages, pending, [], { id: 'user_admin' })).toHaveLength(1);
    expect(unsettledReplies(messages, pending, [], { name: 'Amina Rahman' })).toHaveLength(1);
    // Their own, by their account, or by their name where the store names no account.
    const own = [{ ...messages[0]!, senderId: 'user_admin' }];
    expect(unsettledReplies(own, pending, [], { id: 'user_admin', name: 'Amina' })).toEqual([]);
    const named = [stored('m2', day(5, 12), 'OK')];
    expect(
      unsettledReplies(named, pending, [], { id: 'user_admin', name: 'Amina Rahman' })
    ).toEqual([]);
  });

  it('reads the store’s times as times, with or without their milliseconds', () => {
    const messages = [stored('m2', '2026-10-05T12:00:00Z', 'OK')];
    expect(unsettledReplies(messages, [reply('a', 'OK', '2026-10-05T11:59:59.500Z')], [])).toEqual(
      []
    );
    expect(
      unsettledReplies(messages, [reply('a', 'OK', '2026-10-05T12:00:00.000Z')], [])
    ).toHaveLength(1);
  });
});
