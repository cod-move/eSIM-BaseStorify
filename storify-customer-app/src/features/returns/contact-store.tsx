import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/state-view';
import { useChatAvailable } from '@/features/chat/use-conversations';

/**
 * "Contact the store", in place of the return flow, when the store takes
 * returns only through its team (RETURNS_THROUGH_STORE). The store's own
 * sentence comes first; the way to reach it is the chat when the store has
 * one, and its Contact page (`/contact`) otherwise.
 */
export function ContactStore({ message }: { message?: string }) {
  const t = useTranslations('returns');
  const router = useRouter();
  const chat = useChatAvailable();

  const action = chat ? (
    <Button
      label={t('messageStore')}
      icon="messages"
      onPress={() => router.push('/account/inbox')}
    />
  ) : (
    <Button label={t('contactStore')} icon="mail" onPress={() => router.push('/contact')} />
  );

  return (
    <EmptyState
      icon="help"
      title={t('contactTitle')}
      body={message ?? t('contactBody')}
      action={action}
    />
  );
}
