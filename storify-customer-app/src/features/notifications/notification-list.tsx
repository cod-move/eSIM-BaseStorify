import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useFormatter, useNow, useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { IconCircle } from '@/components/ui/icon-circle';
import { Reveal, useReveal } from '@/components/ui/motion';
import { Text } from '@/components/ui/text';
import type { NotificationItem } from '@/contracts/mobile/shop/v1';
import { useOpenLink } from '@/features/config/use-open-link';
import { cn } from '@/lib/cn';

import { notificationKind } from './notification-kind';
import {
  notificationRows,
  type NotificationGroup,
  type NotificationRow,
} from './notification-rows';
import { useMarkNotificationsRead } from './use-notifications';

type NotificationListProps = {
  items: NotificationItem[];
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
  refreshing: boolean;
  onRefresh: () => void;
};

/**
 * The inbox: newest first, in day groups (Today, Yesterday, the last seven
 * days, Earlier), each a card of rows. More loads as the shopper scrolls, and
 * a pull asks for the list again.
 */
export function NotificationList({
  items,
  hasMore,
  loadingMore,
  onMore,
  refreshing,
  onRefresh,
}: NotificationListProps) {
  const t = useTranslations('notifications');
  const tabBar = useTabBarHeight();
  const reveal = useReveal();
  const now = useNow();
  const rows = useMemo(() => notificationRows(items, now), [items, now]);

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.item.id}
      className="flex-1 bg-background"
      contentContainerClassName="px-4"
      contentContainerStyle={{ paddingBottom: tabBar + 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (hasMore && !loadingMore) onMore();
      }}
      ListFooterComponent={
        loadingMore ? (
          <View className="items-center py-4">
            <ActivityIndicator />
          </View>
        ) : null
      }
      renderItem={({ item: row, index }) => (
        <Reveal entering={reveal(index)}>
          {row.first ? (
            <Text
              variant="chip"
              accessibilityRole="header"
              className={cn('px-1 pb-2 font-semibold text-muted', index === 0 ? 'pt-1' : 'pt-5')}>
              {t(`groups.${row.group}`)}
            </Text>
          ) : null}
          <NotificationEntry row={row} now={now} />
        </Reveal>
      )}
    />
  );
}

/**
 * When a notification came, beside its title. Its group's heading says the
 * day, so today's and yesterday's say the time ("10:42"), the week's the
 * weekday and the time ("Mon 10:42"), and earlier ones the date ("5 Oct",
 * with the year when it is not this one). Never "3 minutes ago": the phone
 * has no relative-time formatter.
 */
function useNotificationTime() {
  const format = useFormatter();

  return (date: Date, group: NotificationGroup, now: Date) => {
    if (Number.isNaN(date.getTime())) return '';
    const time = { hour: 'numeric', minute: '2-digit' } as const;
    if (group === 'today' || group === 'yesterday') return format.dateTime(date, time);
    if (group === 'week') return format.dateTime(date, { weekday: 'short', ...time });
    return format.dateTime(date, {
      day: 'numeric',
      month: 'short',
      ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
    });
  };
}

/**
 * One notification in its group's card: an icon by what it is about, the
 * title (bolder, after a dot, while unread), when it came, and the store's
 * words. A tap marks it read and opens the screen its link points to.
 */
function NotificationEntry({ row, now }: { row: NotificationRow; now: Date }) {
  const { item, group, first, last } = row;
  const t = useTranslations('notifications');
  const format = useFormatter();
  const timeOf = useNotificationTime();
  const openLink = useOpenLink();
  const markRead = useMarkNotificationsRead();
  const { icon, tone } = notificationKind(item.type);
  const date = new Date(item.createdAt);
  const time = timeOf(date, group, now);
  const spoken = Number.isNaN(date.getTime())
    ? null
    : format.dateTime(date, { dateStyle: 'medium', timeStyle: 'short' });
  const unread = !item.read;

  const onPress = () => {
    if (unread) markRead.mutate({ ids: [item.id] });
    if (item.link) openLink(item.link);
  };

  return (
    <View
      className={cn('overflow-hidden bg-surface', first && 'rounded-t-xl', last && 'rounded-b-xl')}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[unread ? t('unread') : null, item.title, item.message, spoken]
          .filter(Boolean)
          .join(', ')}
        onPress={onPress}
        className="min-h-11 flex-row items-start gap-3 px-4 py-3.5 active:bg-surface-alt">
        <IconCircle icon={icon} tone={tone} />
        <View className="flex-1 gap-1">
          <View className="flex-row items-start gap-2">
            {unread ? <View className="mt-1.5 size-2 rounded-full bg-link" /> : null}
            <Text variant="label" numberOfLines={2} className={cn('flex-1', unread && 'font-bold')}>
              {item.title}
            </Text>
            <Text variant="caption" numberOfLines={1} className="pt-0.5">
              {time}
            </Text>
          </View>
          <Text numberOfLines={2} className="text-muted">
            {item.message}
          </Text>
        </View>
      </Pressable>
      {last ? null : <View className="ms-[68px] h-px bg-border" />}
    </View>
  );
}
