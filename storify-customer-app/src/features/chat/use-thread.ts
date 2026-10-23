import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useEffect, useRef } from 'react';

import {
  getChatMessages,
  markChatRead,
  sendChatAttachment,
  sendChatMessage,
} from '@/api/endpoints/chat';
import { etagQuery, selectData, type Cached } from '@/api/etag-query';
import { STALE } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import { LIST_MAX_LIMIT, type ChatMessagePage } from '@/contracts/mobile/shop/v1';
import { useLocale } from '@/i18n/locale-store';

import type { MessageAttachment, PendingMessage } from './attachment';
import { POLL_MS } from './use-conversations';

/** As many as one request may ask for: the store refuses a larger `limit`. */
const PAGE_SIZE = LIST_MAX_LIMIT;

/**
 * One conversation: its newest messages, newest first, with the conversation
 * itself. While `polling` (the screen is in front) it asks again every few
 * seconds, with the last ETag.
 */
export function useThread(id: string, polling: boolean) {
  const locale = useLocale();

  return useQuery({
    queryKey: queryKeys.chatMessages(locale, id),
    queryFn: etagQuery((options) => getChatMessages(locale, id, { limit: PAGE_SIZE }, options)),
    select: selectData,
    refetchInterval: polling ? POLL_MS : false,
    staleTime: STALE.private,
  });
}

/**
 * Marks the conversation read once per count of unread messages while it is in
 * front (`active`), then asks for the badge and the list again. A message that
 * arrives while the thread is open is marked in turn.
 */
export function useMarkRead(id: string, unreadCount: number | undefined, active: boolean) {
  const locale = useLocale();
  const client = useQueryClient();
  const markedFor = useRef<number | null>(null);

  const { mutate } = useMutation({
    mutationFn: () => markChatRead(locale, id),
    onSuccess: () => {
      client.setQueryData<Cached<ChatMessagePage>>(queryKeys.chatMessages(locale, id), (held) =>
        held
          ? {
              ...held,
              data: { ...held.data, conversation: { ...held.data.conversation, unreadCount: 0 } },
            }
          : held
      );
      void client.invalidateQueries({ queryKey: queryKeys.overview(locale) });
      void client.invalidateQueries({ queryKey: queryKeys.chatConversations(locale) });
    },
  });

  useEffect(() => {
    if (unreadCount === undefined || unreadCount === 0) {
      markedFor.current = null;
      return;
    }
    if (!active || markedFor.current === unreadCount) return;
    markedFor.current = unreadCount;
    mutate();
  }, [active, unreadCount, mutate]);
}

type Attempt = { message: string; clientMessageId: string; attachment?: MessageAttachment };

/** What makes two tries the same message: its text and what it carries. */
function sameMessage(a: Attempt, message: string, attachment: MessageAttachment | undefined) {
  const keyOf = (item?: MessageAttachment) =>
    item === undefined
      ? ''
      : item.kind === 'product'
        ? `product:${item.product.id}`
        : `file:${item.file.uri}`;
  return a.message === message && keyOf(a.attachment) === keyOf(attachment);
}

/**
 * Sends the shopper's messages: text, a product it shares, or a file with
 * text beside it. One goes out at a time: a second tap while one is on its way
 * does nothing. The message carries an id made for it, kept for a retry of
 * the same message, so the store never stores it twice.
 */
export function useSendMessage(id: string) {
  const locale = useLocale();
  const client = useQueryClient();
  const sending = useRef(false);
  const attempt = useRef<Attempt | null>(null);

  const mutation = useMutation({
    mutationFn: ({ message, clientMessageId, attachment }: Attempt) =>
      attachment?.kind === 'file'
        ? sendChatAttachment(locale, id, { file: attachment.file, message, clientMessageId })
        : sendChatMessage(locale, id, {
            message,
            clientMessageId,
            ...(attachment ? { productId: attachment.product.id } : {}),
          }),
    onSuccess: (result) => {
      attempt.current = null;
      client.setQueryData<Cached<ChatMessagePage>>(queryKeys.chatMessages(locale, id), (held) => {
        if (!held) return held;
        const known = held.data.items.some((item) => item.id === result.message.id);
        const items = known ? held.data.items : [result.message, ...held.data.items];
        return { ...held, data: { ...held.data, items, conversation: result.conversation } };
      });
      void client.invalidateQueries({ queryKey: queryKeys.chatConversations(locale) });
    },
    // A refusal (the conversation was closed) means it moved on: show it as it is now.
    onError: () => void client.invalidateQueries({ queryKey: queryKeys.chatMessages(locale, id) }),
    onSettled: () => {
      sending.current = false;
    },
  });

  /** Resolves true when the store took the message, false when it was refused or not tried. */
  const send = async (text: string, attachment?: MessageAttachment): Promise<boolean> => {
    const message = text.trim();
    if ((!message && !attachment) || sending.current) return false;
    sending.current = true;

    const retry =
      attempt.current && sameMessage(attempt.current, message, attachment) ? attempt.current : null;
    attempt.current = retry ?? {
      message,
      clientMessageId: randomUUID(),
      ...(attachment ? { attachment } : {}),
    };
    try {
      await mutation.mutateAsync(attempt.current);
      return true;
    } catch {
      return false;
    }
  };

  const pending: PendingMessage | null = mutation.isPending
    ? {
        body: mutation.variables.message,
        ...(mutation.variables.attachment ? { attachment: mutation.variables.attachment } : {}),
      }
    : null;

  return {
    send,
    /** The message on its way, to show at once; null when nothing is. */
    pending,
    /** What went wrong with the last try, until the next one. */
    error: mutation.error,
  };
}
