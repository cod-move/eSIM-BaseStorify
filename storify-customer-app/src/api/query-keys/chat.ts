import type { ChatDraftQuery } from '@/contracts/mobile/shop/v1';

export const chatKeys = {
  /** What a chat about this (a product, a seller, or the store) would be. */
  chatDraft: (locale: string, query: ChatDraftQuery) =>
    ['private', locale, 'chat', 'draft', query] as const,
  /** The shopper's conversations. */
  chatConversations: (locale: string) => ['private', locale, 'chat', 'conversations'] as const,
  /** The newest messages of one conversation, with the conversation itself. */
  chatMessages: (locale: string, id: string) =>
    ['private', locale, 'chat', 'messages', id] as const,
};
