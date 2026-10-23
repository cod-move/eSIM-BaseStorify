import { FlashList } from '@shopify/flash-list';
import { onlineManager } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { NetworkError } from '@/api/errors';
import { IconButton } from '@/components/ui/icon-button';
import { IconCircle } from '@/components/ui/icon-circle';
import { GroupedItem, ListEnd } from '@/components/ui/list-group';
import { SectionLabel } from '@/components/ui/rows';
import { Screen, StackHeader, useBottomSpace } from '@/components/ui/screen';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import type { NotificationItem } from '@/contracts/mobile/biz/v1';
import { PushOffBanner } from '@/features/devices/push-banner';
import { useOpenNotification } from '@/features/shell/use-open-notification';
import { useToday } from '@/i18n/use-list-time';
import { cn } from '@/lib/cn';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';
import { useRefetchOnFocus } from '@/lib/use-refetch-on-focus';

import {
  notificationKind,
  notificationRows,
  type NotificationGroup,
  type NotificationRow,
} from './notification-rows';
import { useMarkNotificationsRead, useNotifications } from './use-notifications';

const FILTERS = ['all', 'unread'] as const;
type Filter = (typeof FILTERS)[number];

/**
 * The operator's notifications, the dashboard bell's:
 * all or the unread ones, newest first, in day groups (Today, Yesterday, the
 * last seven days, Earlier), each a card of rows. A tap marks one read and
 * opens its screen, in its own workspace; "Mark all as read" sits in the
 * header while something is unread. A banner says so when push is off on
 * this phone.
 */
export function NotificationsScreen() {
  const t = useTranslations('notifications');
  const titles = useTranslations('shell.titles');
  const common = useTranslations('common');
  const toast = useToast();
  const bottom = useBottomSpace();
  const today = useToday();
  const [filter, setFilter] = useState<Filter>('all');
  const list = useNotifications({ unreadOnly: filter === 'unread' });
  const { mutate: markRead, isPending: marking } = useMarkNotificationsRead();
  const open = useOpenNotification();
  useRefetchOnFocus(list.refetch);
  const pull = usePullToRefresh(list.refetch);
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const rows = useMemo(() => notificationRows(items, today), [items, today]);
  const unread = list.data?.unreadCount ?? 0;

  const onPress = (item: NotificationItem) => {
    // Offline it stays unread, as it is on the store; its screen says what it can.
    if (!item.read && onlineManager.isOnline()) markRead({ ids: [item.id] });
    if (item.link) open(item.link, item.type);
  };

  const markAll = () => {
    if (!onlineManager.isOnline()) {
      toast.show({ message: common('notSentOffline'), tone: 'offline' });
      return;
    }
    markRead({ all: true });
  };

  const empty =
    filter === 'unread'
      ? { title: t('emptyUnread.title'), body: t('emptyUnread.body') }
      : { title: t('empty.title'), body: t('empty.body') };

  const content = () => {
    if (list.isPending) {
      // Offline with nothing kept, the query waits for the connection: say so.
      return list.fetchStatus === 'paused' ? (
        <ErrorState error={new NetworkError('offline')} onRetry={() => void list.refetch()} />
      ) : (
        <LoadingState shape="rows" leading />
      );
    }
    if (list.isError && !list.data) {
      return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
    }
    return (
      <FlashList
        data={rows}
        extraData={rows.length}
        keyExtractor={(row) => row.item.id}
        getItemType={(row) => (row.index === 0 ? 'headed' : 'row')}
        renderItem={({ item: row, index }) => (
          <View>
            {row.index === 0 ? (
              <SectionLabel
                title={t(`groups.${row.group}`)}
                className={cn('px-1', index === 0 ? 'pt-0' : 'pt-5')}
              />
            ) : null}
            <GroupedItem index={row.index} count={row.count} divider="leading">
              <NotificationEntry row={row} today={today} onPress={() => onPress(row.item)} />
            </GroupedItem>
          </View>
        )}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottom }}
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError) {
            void list.fetchNextPage();
          }
        }}
        ListEmptyComponent={
          <EmptyState
            icon={filter === 'unread' ? 'check-check' : 'bell'}
            placement="top"
            title={empty.title}
            body={empty.body}
          />
        }
        ListFooterComponent={
          <ListEnd
            leading
            loading={list.isFetchingNextPage}
            error={list.isFetchNextPageError || list.isRefetchError ? list.error : null}
            onRetry={() => void (list.isFetchNextPageError ? list.fetchNextPage() : list.refetch())}
          />
        }
      />
    );
  };

  return (
    <Screen
      header={
        <StackHeader
          title={titles('notifications')}
          icon="bell"
          actions={
            unread > 0 ? (
              <IconButton
                icon="check-check"
                label={t('markAll')}
                disabled={marking}
                onPress={markAll}
              />
            ) : null
          }
        />
      }>
      <View className="gap-3 pb-3">
        <PushOffBanner className="mx-4" />
        <SegmentedTabs
          label={t('filters.label')}
          value={filter}
          onChange={setFilter}
          tabs={FILTERS.map((value) => ({
            value,
            label: t(`filters.${value}`),
            count: value === 'unread' ? unread : undefined,
          }))}
          className="mx-4"
        />
      </View>
      {content()}
    </Screen>
  );
}

/**
 * When a notification came, beside its title. Its group's heading says the
 * day, so today's and yesterday's say the time ("10:42"), the week's the
 * weekday and the time ("Mon 10:42"), and earlier ones the date ("5 Oct",
 * with the year when it is not this one).
 */
function useNotificationTime() {
  const format = useFormatter();

  return (date: Date, group: NotificationGroup, today: Date) => {
    if (Number.isNaN(date.getTime())) return '';
    const time = { hour: 'numeric', minute: '2-digit' } as const;
    if (group === 'today' || group === 'yesterday') return format.dateTime(date, time);
    if (group === 'week') return format.dateTime(date, { weekday: 'short', ...time });
    return format.dateTime(date, {
      day: 'numeric',
      month: 'short',
      ...(date.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
    });
  };
}

/**
 * One notification in its group's card: an icon by what it is about, the
 * title (bold, after a dot, while unread), when it came, and the store's words.
 */
function NotificationEntry({
  row,
  today,
  onPress,
}: {
  row: NotificationRow;
  today: Date;
  onPress: () => void;
}) {
  const { item, group } = row;
  const t = useTranslations('notifications');
  const format = useFormatter();
  const timeOf = useNotificationTime();
  const { icon, tone } = notificationKind(item.type);
  const date = new Date(item.createdAt);
  const time = timeOf(date, group, today);
  const spoken = Number.isNaN(date.getTime())
    ? null
    : format.dateTime(date, { dateStyle: 'medium', timeStyle: 'short' });
  const unread = !item.read;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[unread ? t('unread') : null, item.title, item.message, spoken]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      className="min-h-14 flex-row items-start gap-3 px-4 py-3.5 active:bg-surface-alt">
      <IconCircle icon={icon} tone={tone} size="md" />
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
  );
}
