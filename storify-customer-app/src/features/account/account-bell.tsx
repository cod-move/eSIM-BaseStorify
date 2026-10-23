import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { CountBadge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { useUnreadNotificationCount } from '@/features/overview/use-overview';

/** The bell in the Account header: the unread notifications' count, and a way to open them. */
export function AccountBell() {
  const t = useTranslations('notifications');
  const router = useRouter();
  const unread = useUnreadNotificationCount();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('bellLabel', { count: unread })}
      onPress={() => router.push('/account/notifications')}
      className="size-11 items-center justify-center active:opacity-70">
      <View>
        <Icon name="bell" size={24} />
        <CountBadge tone="danger" count={unread} className="absolute -end-2 -top-2" />
      </View>
    </Pressable>
  );
}
