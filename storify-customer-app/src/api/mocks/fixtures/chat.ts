/**
 * The mock store's data for: chat with the store. Every mock shopper has the
 * same conversations. Their unread counts add up to `unreadChatMessageCount`
 * in GET /me/overview: fixtures/overview.ts should send `unreadMessageCount()`.
 */
import type {
  AttachmentPolicy,
  ChatAttachment,
  ChatConversation,
  ChatMessage,
  ChatMessageProduct,
  ChatProduct,
  ChatSeller,
} from '@/contracts/mobile/shop/v1';

import { picture } from './shared';

const MB = 1024 * 1024;

/** What a conversation that takes replies takes: one picture or PDF a message, 4 MB at most. */
export const CHAT_ATTACHMENT_POLICY: AttachmentPolicy = {
  maxFiles: 1,
  types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'].map(
    (mimeType) => ({ mimeType, maxBytes: 4 * MB })
  ),
};

export const SEED_CONVERSATIONS: ChatConversation[] = [
  {
    id: 'cnv_4',
    subject: 'Question about Canvas Weekender Bag',
    seller: {
      id: 'vnd_2',
      name: 'North Trail',
      logo: picture('vendor-north-trail', 'North Trail'),
    },
    product: {
      id: 'prd_canvas',
      slug: 'canvas-weekender-bag',
      name: 'Canvas Weekender Bag',
      image: picture('canvas-weekender-bag', 'Canvas Weekender Bag'),
    },
    status: 'pending',
    canReply: true,
    attachments: CHAT_ATTACHMENT_POLICY,
    lastMessagePreview: 'Yes, it fits a 15 inch laptop with room to spare.',
    lastMessageAt: '2026-10-03T14:05:00Z',
    unreadCount: 2,
    createdAt: '2026-10-03T13:40:00Z',
  },
  {
    id: 'cnv_3',
    subject: 'Store support',
    status: 'pending',
    canReply: true,
    attachments: CHAT_ATTACHMENT_POLICY,
    lastMessagePreview: 'We have moved the delivery of order #1006 to Thursday.',
    lastMessageAt: '2026-10-01T09:30:00Z',
    unreadCount: 1,
    createdAt: '2026-09-30T18:12:00Z',
  },
  {
    id: 'cnv_2',
    subject: 'Message to Urban Loft',
    seller: { id: 'vnd_3', name: 'Urban Loft', logo: picture('vendor-urban-loft', 'Urban Loft') },
    status: 'resolved',
    canReply: true,
    attachments: CHAT_ATTACHMENT_POLICY,
    lastMessagePreview: 'Thank you, the replacement is on its way.',
    lastMessageAt: '2026-09-12T10:00:00Z',
    unreadCount: 0,
    createdAt: '2026-09-10T08:00:00Z',
  },
  {
    id: 'cnv_1',
    subject: 'Message to a seller',
    seller: { id: 'vnd_gone' },
    status: 'closed',
    canReply: false,
    lastMessagePreview: 'This conversation was closed by the store.',
    lastMessageAt: '2026-08-02T16:45:00Z',
    unreadCount: 0,
    createdAt: '2026-08-02T16:00:00Z',
  },
];

function theirs(id: string, senderName: string, body: string, createdAt: string): ChatMessage {
  return { id, fromShopper: false, senderName, body, attachments: [], createdAt };
}

function mine(id: string, body: string, createdAt: string): ChatMessage {
  return { id, fromShopper: true, senderName: 'Nadia', body, attachments: [], createdAt };
}

/** Each conversation's messages, the oldest first. */
const SEED_MESSAGES: Record<string, ChatMessage[]> = {
  cnv_4: [
    mine('msg_4_1', 'Hello, does the weekender bag fit a laptop?', '2026-10-03T13:40:00Z'),
    theirs(
      'msg_4_2',
      'North Trail',
      'Hi Nadia! Which size is your laptop?',
      '2026-10-03T13:52:00Z'
    ),
    mine('msg_4_3', 'A 15 inch one.', '2026-10-03T13:58:00Z'),
    theirs(
      'msg_4_4',
      'North Trail',
      'Yes, it fits a 15 inch laptop with room to spare.',
      '2026-10-03T14:05:00Z'
    ),
  ],
  cnv_3: [
    mine('msg_3_1', 'Where is order #1006?', '2026-09-30T18:12:00Z'),
    theirs(
      'msg_3_2',
      'Store support',
      'We have moved the delivery of order #1006 to Thursday.',
      '2026-10-01T09:30:00Z'
    ),
  ],
  cnv_2: [
    mine('msg_2_1', 'The zip came off on the first day.', '2026-09-10T08:00:00Z'),
    theirs(
      'msg_2_2',
      'Urban Loft',
      'Thank you, the replacement is on its way.',
      '2026-09-12T10:00:00Z'
    ),
  ],
  cnv_1: [
    mine('msg_1_1', 'Is this still available?', '2026-08-02T16:00:00Z'),
    theirs(
      'msg_1_2',
      'Store support',
      'This conversation was closed by the store.',
      '2026-08-02T16:45:00Z'
    ),
  ],
};

let conversations = SEED_CONVERSATIONS.map((item) => ({ ...item }));
let messages: Record<string, ChatMessage[]> = cloneMessages();
let sentCount = 0;

function cloneMessages(): Record<string, ChatMessage[]> {
  return Object.fromEntries(Object.entries(SEED_MESSAGES).map(([id, list]) => [id, [...list]]));
}

/** Forgets what the shopper sent and read, until the next one. */
export function resetChat(): void {
  conversations = SEED_CONVERSATIONS.map((item) => ({ ...item }));
  messages = cloneMessages();
  sentCount = 0;
}

/** Most recent activity first, as the store lists them. */
export function listConversations(): ChatConversation[] {
  return [...conversations].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

export function findConversation(id: string): ChatConversation | undefined {
  return conversations.find((item) => item.id === id);
}

/** A conversation's messages, the newest first. */
export function listMessages(id: string): ChatMessage[] {
  return [...(messages[id] ?? [])].reverse();
}

/** What a message carries besides its text: a product it shares, a file. */
export type MessageExtras = {
  product?: ChatMessageProduct;
  /** The body is only the product's name and link. */
  bodyIsFallback?: boolean;
  attachments?: ChatAttachment[];
};

/**
 * The shopper's message, added at the end. A message already sent with the same
 * `clientMessageId` is answered as it was stored, not added twice.
 */
export function sendMessage(
  conversation: ChatConversation,
  body: string,
  clientMessageId: string,
  senderName: string,
  extras: MessageExtras = {}
): ChatMessage {
  const list = (messages[conversation.id] ??= []);
  const earlier = list.find((item) => item.clientMessageId === clientMessageId);
  if (earlier) return earlier;

  sentCount += 1;
  const createdAt = new Date().toISOString();
  const message: ChatMessage = {
    id: `msg_sent_${sentCount}`,
    fromShopper: true,
    senderName,
    body,
    attachments: extras.attachments ?? [],
    ...(extras.product ? { product: extras.product } : {}),
    ...(extras.bodyIsFallback ? { bodyIsFallback: true } : {}),
    clientMessageId,
    createdAt,
  };
  list.push(message);
  Object.assign(conversation, {
    lastMessagePreview:
      (extras.bodyIsFallback ? extras.product?.name : body) ||
      extras.attachments?.[0]?.name ||
      body,
    lastMessageAt: createdAt,
    status: 'open',
  });
  return message;
}

/** Marks a conversation read. Returns the unread messages left in all of them. */
export function markRead(conversation: ChatConversation): number {
  conversation.unreadCount = 0;
  return unreadMessageCount();
}

/** Unread messages in all of the shopper's conversations. */
export function unreadMessageCount(): number {
  return conversations.reduce((total, item) => total + item.unreadCount, 0);
}

/**
 * The shopper's open conversation about this product (or, with none, the
 * store's support), or a new one when there is none yet. `created` says which.
 */
export function openConversation(
  about: { product?: ChatProduct; seller?: ChatSeller },
  now = new Date().toISOString()
): { conversation: ChatConversation; created: boolean } {
  const productId = about.product?.id;
  const open = conversations.find(
    (item) => item.canReply && item.product?.id === productId && (productId || !item.seller)
  );
  if (open) return { conversation: open, created: false };

  const conversation: ChatConversation = {
    id: `cnv_new_${conversations.length + 1}`,
    subject: about.product ? `Question about ${about.product.name}` : 'Store support',
    ...(about.seller ? { seller: about.seller } : {}),
    ...(about.product ? { product: about.product } : {}),
    status: 'open',
    canReply: true,
    attachments: CHAT_ATTACHMENT_POLICY,
    lastMessagePreview: '',
    lastMessageAt: now,
    unreadCount: 0,
    createdAt: now,
  };
  conversations.push(conversation);
  return { conversation, created: true };
}
