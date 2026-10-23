import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useRef } from 'react';

import { getChatDraft, startChat } from '@/api/endpoints/chat';
import { STALE } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import type { ChatDraftQuery } from '@/contracts/mobile/shop/v1';
import { useSession } from '@/features/auth/use-session';
import { useLocale } from '@/i18n/locale-store';

/**
 * A question about a product, to whoever sells it (the store, for its own).
 * The draft says who will answer, whether they take chats now, and hands back
 * the shopper's open conversation about the product when there is one. The
 * first message starts the conversation, or joins that open one; it carries
 * an id made for it, kept for a retry of the same text, so it is stored once.
 */
export function useStartChat(about: ChatDraftQuery) {
  const locale = useLocale();
  const client = useQueryClient();
  const { isSignedIn } = useSession();
  const attempt = useRef<{ message: string; clientMessageId: string } | null>(null);

  const draft = useQuery({
    queryKey: queryKeys.chatDraft(locale, about),
    queryFn: ({ signal }) => getChatDraft(locale, about, signal),
    enabled: isSignedIn,
    staleTime: STALE.private,
  });

  const mutation = useMutation({
    mutationFn: (request: { message: string; clientMessageId: string }) =>
      startChat(locale, { ...about, ...request }),
    onSuccess: () => {
      attempt.current = null;
      void client.invalidateQueries({ queryKey: queryKeys.chatConversations(locale) });
      void client.invalidateQueries({ queryKey: queryKeys.chatDraft(locale, about) });
    },
  });

  /** Resolves with the conversation the message went to, or null when it was refused or not sent. */
  const send = async (text: string): Promise<string | null> => {
    const message = text.trim();
    if (!message || mutation.isPending) return null;
    const retry = attempt.current?.message === message ? attempt.current : null;
    attempt.current = retry ?? { message, clientMessageId: randomUUID() };
    try {
      const result = await mutation.mutateAsync(attempt.current);
      return result.conversation.id;
    } catch {
      return null;
    }
  };

  return {
    draft: draft.data,
    send,
    sending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
