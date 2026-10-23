/**
 * Endpoints: chat with the store. Its screen is `/account/inbox`; the badge
 * reads `unreadChatMessageCount` from GET /me/overview.
 */
import {
  CHAT_ATTACHMENT_FORM_FIELDS,
  ChatConversationList,
  ChatDraft,
  ChatMessagePage,
  ChatReadResult,
  ChatSendResult,
  ChatStartResult,
  type ChatConversationListQuery,
  type ChatDraftQuery,
  type ChatMessagesQuery,
  type SendChatMessageRequest,
  type StartChatRequest,
} from '@/contracts/mobile/shop/v1';

import { api, sendFile } from '../api';
import type { Conditional } from '../etag-query';
import type { FormFile } from '../transport';

/** What a chat from this screen would be, and whether the store takes chats at all. */
export function getChatDraft(locale: string, query: ChatDraftQuery, signal: AbortSignal) {
  return api.data({ locale, path: '/chat/draft', query, auth: 'user', signal }, ChatDraft);
}

/**
 * A page of the shopper's conversations, the most recent activity first, with
 * the unread count of all. Polled with the last ETag: an unchanged list answers 304.
 */
export function getChatConversations(
  locale: string,
  query: ChatConversationListQuery,
  { etag, signal }: Conditional
) {
  return api.request(
    { locale, path: '/chat/conversations', query, auth: 'user', etag, signal },
    ChatConversationList
  );
}

function conversationPath(id: string) {
  return `/chat/conversations/${encodeURIComponent(id)}`;
}

/**
 * The newest messages of a conversation, with the conversation itself. Polled
 * with the last ETag: an unchanged conversation answers 304.
 */
export function getChatMessages(
  locale: string,
  id: string,
  query: ChatMessagesQuery,
  { etag, signal }: Conditional
) {
  return api.request(
    { locale, path: `${conversationPath(id)}/messages`, query, auth: 'user', etag, signal },
    ChatMessagePage
  );
}

/**
 * Sends the shopper's message: text, a product it shares (`productId`), or
 * both. A retry with the same `clientMessageId` answers the message already
 * sent, never a second one.
 */
export function sendChatMessage(locale: string, id: string, body: SendChatMessageRequest) {
  return api.data(
    { locale, path: `${conversationPath(id)}/messages`, method: 'POST', body, auth: 'user' },
    ChatSendResult
  );
}

/**
 * Sends a file into the conversation, with the text written beside it. A
 * retry with the same `clientMessageId` answers the message already sent and
 * the store keeps the file once.
 */
export function sendChatAttachment(
  locale: string,
  id: string,
  request: { file: FormFile; message: string; clientMessageId: string }
) {
  const fields: Record<string, string> = {
    [CHAT_ATTACHMENT_FORM_FIELDS.clientMessageId]: request.clientMessageId,
  };
  if (request.message) fields[CHAT_ATTACHMENT_FORM_FIELDS.message] = request.message;
  return sendFile(
    {
      locale,
      path: `${conversationPath(id)}/attachments`,
      field: CHAT_ATTACHMENT_FORM_FIELDS.file,
      file: request.file,
      fields,
    },
    ChatSendResult
  );
}

/**
 * The first message about a product, a seller or the store. When the shopper
 * already has an open conversation about it, the message joins that one
 * (`created: false`). A retry with the same `clientMessageId` is answered once.
 */
export function startChat(locale: string, body: StartChatRequest) {
  return api.data(
    { locale, path: '/chat/conversations', method: 'POST', body, auth: 'user' },
    ChatStartResult
  );
}

/** Marks the store's messages in a conversation as read. */
export function markChatRead(locale: string, id: string) {
  return api.data(
    { locale, path: `${conversationPath(id)}/read`, method: 'POST', auth: 'user' },
    ChatReadResult
  );
}
