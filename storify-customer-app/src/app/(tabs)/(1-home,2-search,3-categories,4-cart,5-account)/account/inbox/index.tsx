import { Stack, useIsFocused } from 'expo-router';
import { useTranslations } from 'use-intl';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { ConversationList } from '@/features/chat/list';
import { useChatParties } from '@/features/chat/parties';
import { useConversations } from '@/features/chat/use-conversations';

/** The shopper's conversations with the store. Signed-in shoppers only; the store checks it too. */
export default function InboxScreen() {
  const t = useTranslations('chat');
  const focused = useIsFocused();
  const conversations = useConversations(focused);
  const parties = useChatParties();

  const body = () => {
    if (conversations.isPending) return <LoadingState />;
    if (conversations.isError) {
      return (
        <ErrorState error={conversations.error} onRetry={() => void conversations.refetch()} />
      );
    }
    if (conversations.data.items.length === 0) {
      return <EmptyState icon="messages" title={t('emptyTitle')} body={t('emptyBody')} />;
    }
    return <ConversationList items={conversations.data.items} parties={parties} />;
  };

  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      {body()}
    </>
  );
}
