import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { CountBadge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { useChatAvailable, useUnreadChatCount } from '@/features/chat/use-conversations';

/**
 * The chat button in the Account header, after the bell, to `/account/inbox`,
 * its badge the unread count the store sends. It draws nothing while chat is off.
 */
export function MessagesTile() {
  const t = useTranslations('chat');
  const router = useRouter();
  const available = useChatAvailable();
  const unread = useUnreadChatCount();

  if (!available) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('buttonLabel', { count: unread })}
      onPress={() => router.push('/account/inbox')}
      className="size-11 items-center justify-center active:opacity-70">
      <View>
        <Icon name="messages" size={24} />
        <CountBadge tone="danger" count={unread} className="absolute -end-2 -top-2" />
      </View>
    </Pressable>
  );
}
