import { useTranslations } from 'use-intl';

import { useMe } from '@/features/account/use-me';
import { useConfig } from '@/features/config/use-config';
import type { ChatConversation, ImageSet } from '@/contracts/mobile/shop/v1';

/** Who is talking, as far as the app knows them: the shopper, and the store they write to. */
export type ChatParties = {
  shopper: { name: string; image: ImageSet | string | undefined };
  store: { icon: ImageSet | undefined };
};

/** The shopper's name and picture, and the store's square icon, for the avatars of a chat. */
export function useChatParties(): ChatParties {
  const me = useMe().data;
  const icon = useConfig().data?.store.icon;

  return {
    shopper: { name: me?.name ?? '', image: me?.image ?? me?.imageUrl },
    store: { icon },
  };
}

/**
 * Who answers a conversation, and the picture that stands for them: the seller
 * by name and store logo, or the store by its square icon (never its wide logo,
 * which does not fit a circle). With no picture the avatar shows the first
 * letter of the name.
 */
export function useParty(conversation: ChatConversation, parties: ChatParties) {
  const t = useTranslations('chat');

  if (conversation.seller) {
    return { name: conversation.seller.name ?? t('seller'), picture: conversation.seller.logo };
  }
  return { name: t('store'), picture: parties.store.icon };
}
