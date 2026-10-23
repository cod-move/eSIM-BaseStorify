import { useCallback } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useFormatter, useTranslations } from 'use-intl';

import { Icon } from '@/components/ui/icon';
import { useBottomSpace } from '@/components/ui/screen';
import { EmptyState, ErrorState, InlineError } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { useNotifications } from '@/features/more/use-notifications';
import { useOnline } from '@/features/orders/use-online';
import { useWorkspace } from '@/features/workspace/use-workspace';
import { VendorNotice } from '@/features/workspace/vendor-notice';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';
import { useRefetchOnFocus } from '@/lib/use-refetch-on-focus';

import { HomeBusinessLinks } from './home-actions';
import { HomeAttention } from './home-attention';
import { HomeHero } from './home-hero';
import { HomeConversationPreview, HomeOrderPreview } from './home-previews';
import { HomeSkeleton } from './home-skeleton';
import { HOME_TILES, isKnownTile } from './home-tiles';
import { useBrandStatusBar } from './use-brand-status-bar';
import { useHiddenAmounts } from './use-hidden-amounts';
import { useHome } from './use-home';
import { useHomeConversations, useHomeOrders } from './use-home-previews';

/**
 * Operational Home, as a banking app's: the store's
 * colour from the top, with what was collected, its graph and the quick
 * actions (`HomeHero`); then a sheet rising over it with the queues waiting
 * and small previews that load on their own. Money, counts and the graph's
 * scale are the API's.
 */
export function HomeScreen() {
  const t = useTranslations('home');
  const format = useFormatter();
  const workspace = useWorkspace();
  const home = useHome();
  const notifications = useNotifications();
  const online = useOnline();
  const bottom = useBottomSpace();
  const [hidden, toggleHidden] = useHiddenAmounts();
  const spinner = useCSSVariable('--color-primary-foreground');
  useBrandStatusBar();
  const capabilities = workspace.status === 'ready' ? workspace.access.capabilities : [];
  const tiles = (home.data?.tiles ?? [])
    .filter(isKnownTile)
    .filter((tile) => capabilities.includes(HOME_TILES[tile.kind].capability));
  const money = tiles.filter((tile) => HOME_TILES[tile.kind].money);
  const attention = tiles.filter((tile) => !HOME_TILES[tile.kind].money);
  const showsOrders = attention.some(
    (tile) => tile.kind === 'ORDERS_NEEDING_ACTION' && tile.count !== 0
  );
  const showsConversations = attention.some(
    (tile) => tile.kind === 'UNREAD_MESSAGES' && tile.count !== 0
  );
  const orders = useHomeOrders(showsOrders);
  const conversations = useHomeConversations(showsConversations);
  const { refetch: readHome } = home;
  const { refetch: readOrders } = orders;
  const { refetch: readConversations } = conversations;
  const { refetch: readNotifications } = notifications;
  const refresh = useCallback(
    () =>
      Promise.allSettled([
        readHome(),
        readNotifications(),
        ...(showsOrders ? [readOrders()] : []),
        ...(showsConversations ? [readConversations()] : []),
      ]),
    [readHome, readNotifications, readOrders, readConversations, showsOrders, showsConversations]
  );
  useRefetchOnFocus(refresh);
  const pull = usePullToRefresh(refresh);
  const checked =
    home.dataUpdatedAt > 0
      ? t('checked', {
          time: format.dateTime(new Date(home.dataUpdatedAt), {
            hour: 'numeric',
            minute: '2-digit',
          }),
        })
      : undefined;
  const spinnerColor = spinner ? String(spinner) : undefined;

  return (
    <View className="flex-1 bg-background">
      {/* Pulled down past its top, the page shows the header's colour, not a grey gap. */}
      <View className="absolute inset-x-0 top-0 h-1/2 bg-primary" />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: bottom }}
        refreshControl={
          <RefreshControl
            refreshing={pull.refreshing}
            onRefresh={pull.onRefresh}
            tintColor={spinnerColor}
          />
        }>
        <HomeHero
          tiles={money}
          trend={money.length ? home.data?.collectionTrend : undefined}
          today={home.data?.day}
          loading={home.isPending && capabilities.includes('VIEW_ORDERS')}
          hidden={hidden}
          onToggleHidden={toggleHidden}
          unread={notifications.data?.unreadCount}
        />
        {/* The sheet: its rounded top over the header's colour. */}
        <View className="grow bg-primary">
          <View className="grow gap-6 rounded-t-[28px] bg-background px-4 pt-3">
            <View
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
              className="h-1 w-10 self-center rounded-full bg-border"
            />
            <VendorNotice />
            {!online ? (
              <View
                accessibilityRole="alert"
                className="flex-row items-start gap-3 rounded-[22px] bg-warning-soft p-4">
                <Icon name="wifi-off" size={20} colorClassName="accent-warning" />
                <View className="flex-1 gap-0.5">
                  <Text variant="meta" className="text-foreground">
                    {t('offline')}
                  </Text>
                  {checked ? (
                    <Text variant="caption" className="text-foreground">
                      {checked}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}
            {home.isPending ? (
              <HomeSkeleton />
            ) : !home.data ? (
              <ErrorState error={home.error} onRetry={() => void home.refetch()} />
            ) : (
              <>
                {tiles.length ? (
                  <HomeAttention tiles={attention} />
                ) : (
                  <EmptyState icon="home" title={t('emptyTitle')} body={t('emptyBody')} />
                )}
                {home.error ? (
                  <InlineError error={home.error} onRetry={() => void home.refetch()} />
                ) : null}
              </>
            )}
            {showsOrders ? <HomeOrderPreview query={orders} /> : null}
            {showsConversations ? <HomeConversationPreview query={conversations} /> : null}
            <HomeBusinessLinks />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
