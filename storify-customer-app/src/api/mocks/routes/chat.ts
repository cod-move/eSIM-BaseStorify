/** Chat with the store: whether it takes chats, the shopper's conversations, their messages. */
import * as z from 'zod';

import {
  CHAT_ATTACHMENT_FORM_FIELDS,
  CHAT_MESSAGE_MAX_LENGTH,
  ChatDraftQuery,
  SendChatMessageRequest,
  StartChatRequest,
  type ChatAttachment,
  type ChatMessageProduct,
  type ChatProduct,
  type ChatSeller,
  type ChatStartResult,
  type ChatConversation,
  type ChatConversationList,
  type ChatDraft,
  type ChatMessagePage,
  type ChatReadResult,
  type ChatSendResult,
} from '@/contracts/mobile/shop/v1';

import {
  findConversation,
  listConversations,
  listMessages,
  markRead,
  openConversation,
  resetChat,
  sendMessage,
  unreadMessageCount,
} from '../fixtures/chat';
import { findProduct, findVendor } from '../fixtures/product';
import { listProducts } from '../fixtures/products';
import { picture } from '../fixtures/shared';
import { MockError, requireUser, type MockContext, type MockRoute } from '../kit';
import { state } from '../state';

/** The product a chat is about, and the seller who answers for it (the store, without one). */
function subjectOf(
  productId: string | undefined,
  locale: string
): { product?: ChatProduct; seller?: ChatSeller } {
  if (!productId) return {};
  const product =
    listProducts(locale).find((item) => item.id === productId) ?? findProduct(productId, locale);
  if (!product) throw new MockError(404, 'NOT_FOUND', 'Product not found');
  const logo = product.vendor ? findVendor(product.vendor.slug)?.logo : undefined;
  return {
    product: { id: product.id, slug: product.slug, name: product.name, image: product.image },
    ...(product.vendor
      ? {
          seller: {
            id: product.vendor.slug,
            name: product.vendor.name,
            ...(logo ? { logo } : {}),
          },
        }
      : {}),
  };
}

function pageOffset(ctx: MockContext): number {
  const offset = Number(ctx.query.get('cursor') ?? 0);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new MockError(400, 'VALIDATION_ERROR', 'Unknown cursor');
  }
  return offset;
}

function pageLimit(ctx: MockContext): number {
  return Math.min(Math.max(Number(ctx.query.get('limit') ?? 20), 1), 40);
}

function conversationOf(ctx: MockContext, id: string): ChatConversation {
  requireUser(ctx);
  const conversation = findConversation(id);
  if (!conversation) throw new MockError(404, 'NOT_FOUND', 'Conversation not found');
  return conversation;
}

/** A conversation the store closed takes nothing more. */
function requireOpen(conversation: ChatConversation): void {
  if (!conversation.canReply) {
    throw new MockError(
      409,
      'CONFLICT',
      'This conversation was closed by the store. Start a new one.',
      'CONVERSATION_CLOSED'
    );
  }
}

/**
 * The product the shopper shares, as it is now, and its link: one the
 * storefront lists and, in a seller's conversation, one of that seller's.
 */
function sharedProduct(
  conversation: ChatConversation,
  productId: string,
  locale: string
): { product: ChatMessageProduct; link: string } {
  const card = listProducts(locale).find((item) => item.id === productId);
  const { seller } = conversation;
  const sellersOwn =
    !seller ||
    (card?.vendor !== undefined &&
      (card.vendor.slug === seller.id || card.vendor.name === seller.name));
  if (!card || !sellersOwn) {
    throw new MockError(
      409,
      'CONFLICT',
      'This product cannot be shared in this conversation.',
      'PRODUCT_NOT_AVAILABLE'
    );
  }
  return {
    product: {
      id: card.id,
      slug: card.slug,
      name: card.name,
      ...(card.image ? { image: card.image } : {}),
      ...(card.price ? { price: card.price } : {}),
      ...(card.compareAtPrice ? { compareAtPrice: card.compareAtPrice } : {}),
    },
    link: `https://mock.storify.invalid/products/${card.slug}`,
  };
}

/** A file part of a form: what the phone, or a browser, says of it. */
type FormFilePart = { name: string; type: string; size?: number; uri?: string };

/**
 * The text fields and the file of a `multipart/form-data` body. A browser's
 * form is read with `forEach`, a file as a `Blob`; a phone's (React Native)
 * hands its parts out with `getParts`, a file as its `uri`, name and type,
 * without its size.
 */
function formOf(body: unknown): { fields: Map<string, string>; file?: FormFilePart } {
  const fields = new Map<string, string>();
  let file: FormFilePart | undefined;
  const take = (name: string, value: unknown) => {
    if (typeof value === 'string') {
      fields.set(name, value);
    } else if (name !== CHAT_ATTACHMENT_FORM_FIELDS.file) {
      return;
    } else if (typeof Blob !== 'undefined' && value instanceof Blob) {
      const named = 'name' in value ? String(value.name) : 'file';
      file = { name: named, type: value.type, size: value.size };
    } else if (typeof value === 'object' && value !== null && 'uri' in value) {
      const part = value as { uri: string; name?: string; type?: string };
      file = { name: part.name ?? 'file', type: part.type ?? '', uri: part.uri };
    }
  };
  if (typeof body !== 'object' || body === null) return { fields };
  if ('getParts' in body && typeof body.getParts === 'function') {
    for (const part of body.getParts() as { fieldName: string; string?: string }[]) {
      take(part.fieldName, part.string ?? part);
    }
  } else if (body instanceof FormData) {
    body.forEach((value, name) => take(name, value));
  }
  return { fields, ...(file ? { file } : {}) };
}

/** The file as the message carries it, once the conversation's policy has taken it. */
function storedFile(conversation: ChatConversation, file: FormFilePart): ChatAttachment {
  const accepted = conversation.attachments?.types.find((type) => type.mimeType === file.type);
  if (!accepted || (file.size !== undefined && file.size > accepted.maxBytes)) {
    throw new MockError(
      400,
      'VALIDATION_ERROR',
      'This conversation does not take this file.',
      'ATTACHMENT_NOT_ACCEPTED'
    );
  }
  const id = `chat-file-${state.nextId++}`;
  const isImage = file.type.startsWith('image/');
  // A phone's file is on the phone, and its own address shows it there. A browser's has none.
  const url =
    file.uri ?? `https://mock.storify.invalid/chat/files/${id}/${encodeURIComponent(file.name)}`;
  return {
    type: isImage ? 'image' : 'document',
    url,
    ...(isImage && !file.uri ? { image: picture(id, file.name) } : {}),
    name: file.name,
    mimeType: file.type,
    ...(file.size !== undefined ? { size: file.size } : {}),
  };
}

/** The text fields of POST …/attachments. */
const AttachmentFields = z.object({
  message: z.string().max(CHAT_MESSAGE_MAX_LENGTH).default(''),
  clientMessageId: z.uuid(),
});

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/chat/draft',
    handle: (ctx): ChatDraft => {
      requireUser(ctx);
      const query = ChatDraftQuery.parse(Object.fromEntries(ctx.query));
      const about = subjectOf(query.productId, ctx.locale);
      const open = listConversations().find(
        (item) => item.canReply && about.product && item.product?.id === about.product.id
      );
      return { available: true, ...about, ...(open ? { conversation: open } : {}) };
    },
  },
  {
    method: 'GET',
    path: '/chat/conversations',
    handle: (ctx): ChatConversationList => {
      requireUser(ctx);
      const offset = pageOffset(ctx);
      const limit = pageLimit(ctx);
      const items = listConversations();
      return {
        items: items.slice(offset, offset + limit),
        nextCursor: offset + limit < items.length ? String(offset + limit) : null,
        unreadCount: unreadMessageCount(),
      };
    },
  },
  {
    method: 'POST',
    path: '/chat/conversations',
    handle: (ctx): ChatStartResult => {
      const user = requireUser(ctx);
      const body = StartChatRequest.safeParse(ctx.body);
      if (!body.success) throw new MockError(400, 'VALIDATION_ERROR', 'Not a message');
      const { conversation, created } = openConversation(
        subjectOf(body.data.productId, ctx.locale)
      );
      const message = sendMessage(
        conversation,
        body.data.message,
        body.data.clientMessageId,
        user.name
      );
      return { conversation, message, created };
    },
  },
  {
    method: 'GET',
    path: /^\/chat\/conversations\/([^/]+)\/messages$/,
    handle: (ctx, [id = '']): ChatMessagePage => {
      const conversation = conversationOf(ctx, id);
      const offset = pageOffset(ctx);
      const limit = pageLimit(ctx);
      const items = listMessages(id);
      return {
        items: items.slice(offset, offset + limit),
        nextCursor: offset + limit < items.length ? String(offset + limit) : null,
        conversation,
      };
    },
  },
  {
    method: 'POST',
    path: /^\/chat\/conversations\/([^/]+)\/messages$/,
    handle: (ctx, [id = '']): ChatSendResult => {
      const user = requireUser(ctx);
      const conversation = conversationOf(ctx, id);
      const body = SendChatMessageRequest.safeParse(ctx.body);
      if (!body.success) throw new MockError(400, 'VALIDATION_ERROR', 'Not a message');
      requireOpen(conversation);
      const { message: text, clientMessageId, productId } = body.data;
      const shared = productId ? sharedProduct(conversation, productId, ctx.locale) : undefined;
      // Without text, the body is the product's name and link, for readers that draw no card.
      const fallback = shared !== undefined && text.trim() === '';
      const message = sendMessage(
        conversation,
        fallback ? `${shared.product.name}\n${shared.link}` : text,
        clientMessageId,
        user.name,
        shared ? { product: shared.product, bodyIsFallback: fallback } : {}
      );
      return { conversation, message };
    },
  },
  {
    method: 'POST',
    path: /^\/chat\/conversations\/([^/]+)\/attachments$/,
    handle: (ctx, [id = '']): ChatSendResult => {
      const user = requireUser(ctx);
      const conversation = conversationOf(ctx, id);
      const { fields, file } = formOf(ctx.body);
      const text = AttachmentFields.safeParse({
        message: fields.get(CHAT_ATTACHMENT_FORM_FIELDS.message),
        clientMessageId: fields.get(CHAT_ATTACHMENT_FORM_FIELDS.clientMessageId),
      });
      if (!text.success || !file) throw new MockError(400, 'VALIDATION_ERROR', 'Not a file');
      requireOpen(conversation);
      // A retry answers the message already stored, and its file is not kept twice.
      const earlier = listMessages(id).find(
        (item) => item.clientMessageId === text.data.clientMessageId
      );
      if (earlier) return { conversation, message: earlier };
      const message = sendMessage(
        conversation,
        text.data.message,
        text.data.clientMessageId,
        user.name,
        { attachments: [storedFile(conversation, file)] }
      );
      return { conversation, message };
    },
  },
  {
    method: 'POST',
    path: /^\/chat\/conversations\/([^/]+)\/read$/,
    handle: (ctx, [id = '']): ChatReadResult => ({
      unreadCount: markRead(conversationOf(ctx, id)),
    }),
  },
];

export const reset = resetChat;
