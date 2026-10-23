import { Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { TextLink } from '@/components/ui/button';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { NotificationList } from '@/features/notifications/notification-list';
import {
  useMarkNotificationsRead,
  useNotifications,
} from '@/features/notifications/use-notifications';
import { useUnreadNotificationCount } from '@/features/overview/use-overview';
import { useRefresh } from '@/lib/use-refresh';

const FILTERS = ['all', 'unread'] as const;
type Filter = (typeof FILTERS)[number];

/** The inbox, all or the unread ones. Signed-in shoppers only; the store checks it too. */
export default function NotificationsScreen() {
  const t = useTranslations('notifications');
  const [filter, setFilter] = useState<Filter>('all');
  const notifications = useNotifications({ unreadOnly: filter === 'unread' });
  const markRead = useMarkNotificationsRead();
  const refresh = useRefresh(notifications.refetch);
  // The bell's count stands in while the other filter's list is on its way.
  const bell = useUnreadNotificationCount();
  const unread = notifications.data?.unreadCount ?? bell;

  const body = () => {
    if (notifications.isPending) return <LoadingState />;
    if (notifications.isError) {
      return (
        <ErrorState error={notifications.error} onRetry={() => void notifications.refetch()} />
      );
    }
    if (notifications.data.items.length === 0) {
      return filter === 'unread' ? (
        <EmptyState icon="check-circle" title={t('caughtUpTitle')} body={t('caughtUpBody')} />
      ) : (
        <EmptyState icon="bell" title={t('emptyTitle')} body={t('emptyBody')} />
      );
    }
    return (
      <NotificationList
        items={notifications.data.items}
        hasMore={notifications.hasNextPage}
        loadingMore={notifications.isFetchingNextPage}
        onMore={() => void notifications.fetchNextPage()}
        refreshing={refresh.refreshing}
        onRefresh={refresh.onRefresh}
      />
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: t('title'),
          headerRight:
            unread > 0
              ? () => (
                  <TextLink
                    label={t('markAllRead')}
                    disabled={markRead.isPending}
                    onPress={() => markRead.mutate({ all: true })}
                  />
                )
              : undefined,
        }}
      />
      <View className="flex-1 bg-background">
        <SegmentedTabs
          label={t('filters.label')}
          value={filter}
          onChange={setFilter}
          tabs={FILTERS.map((value) => ({
            value,
            label: t(`filters.${value}`),
            count: value === 'unread' ? unread : undefined,
          }))}
          className="mx-4 mb-3 mt-2"
        />
        {body()}
      </View>
    </>
  );
}
