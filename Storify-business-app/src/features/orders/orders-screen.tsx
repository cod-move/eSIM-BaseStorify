import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { FilterTabs } from '@/components/ui/filter-tabs';
import { GroupedItem, ListEnd } from '@/components/ui/list-group';
import { Screen, TabHeader, useBottomSpace } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { ORDER_LIST_TABS, type OrderListQuery } from '@/contracts/mobile/biz/v1';
import { useHome } from '@/features/home/use-home';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';
import { useRefetchOnFocus } from '@/lib/use-refetch-on-focus';

import { OrderRow } from './order-row';
import { CreateOrderButton } from './create-order-button';
import { useOrders } from './use-orders';

export type OrderTab = NonNullable<OrderListQuery['tab']>;

/** The tab the list opens on: the orders that wait for the operator. */
export const DEFAULT_ORDER_TAB: OrderTab = 'needs_action';

/** The API's longest search. */
const SEARCH_MAX = 100;

function isOrderTab(value: unknown): value is OrderTab {
  return (ORDER_LIST_TABS as readonly unknown[]).includes(value);
}

/**
 * The screen's own navigation: its `setParams` changes this tab's address
 * even when the search settles after another tab came to the front
 * (`router.setParams` changes the one in front).
 */
type OrdersNavigation = { setParams: (params: { search?: string }) => void };

/**
 * Orders: the search by number or customer, the status tabs, and
 * the list, a page at a time as it scrolls. The tab and the search are part
 * of the address (`/orders?tab=needs_action&search=1037`), so Home's tiles
 * open the list they count, without a search typed there before.
 *
 * The list is read again on returning to the tab or from an order, on pull to
 * refresh, on a push about an order (`useOrderPushRefresh`), after a step on
 * an order, and when the app returns to the foreground; each page with its
 * ETag.
 */
export function OrdersScreen() {
  const t = useTranslations('orders');
  const navigation = useNavigation<OrdersNavigation>();
  const params = useLocalSearchParams<{ tab?: string; search?: string }>();
  const tab = isOrderTab(params.tab) ? params.tab : DEFAULT_ORDER_TAB;
  const asked = params.search ?? '';
  const [typed, setTyped] = useState(asked);
  // Opening the tab from a link (a tile) gives it an address of its own, with
  // no search: the field empties with it. (A tab stays mounted behind the others.)
  const [lastAsked, setLastAsked] = useState(asked);
  if (asked !== lastAsked) {
    setLastAsked(asked);
    if (!asked) setTyped('');
  }
  const search = useDebouncedValue(typed.trim().slice(0, SEARCH_MAX));
  // The search shown goes into this screen's address, beside the tab.
  useEffect(() => {
    if (search !== asked) navigation.setParams({ search: search || undefined });
  }, [search, asked, navigation]);
  const orders = useOrders(search ? { tab, search } : { tab });
  // The "needs action" chip carries Home's count of that very tab: every such
  // order, so it is left off while a search narrows the list to fewer.
  const home = useHome();
  const needing = home.data?.tiles.find((tile) => tile.kind === 'ORDERS_NEEDING_ACTION')?.count;
  const bottom = useBottomSpace();
  const { refetch: refetchOrders } = orders;
  const { refetch: refetchHome } = home;
  const refresh = useCallback(
    () => Promise.all([refetchOrders(), refetchHome()]),
    [refetchOrders, refetchHome]
  );
  useRefetchOnFocus(refresh);
  const { refreshing, onRefresh } = usePullToRefresh(refresh);

  const rows = orders.data ?? [];
  const tabs = ORDER_LIST_TABS.map((value) => ({
    value,
    label: t(`tabs.${value}`),
    count: value === 'needs_action' && needing && !search ? needing : undefined,
  }));

  const loadMore = () => {
    if (orders.hasNextPage && !orders.isFetchingNextPage && !orders.isFetchNextPageError) {
      void orders.fetchNextPage();
    }
  };

  let list;
  if (orders.isPending) {
    list = <LoadingState shape="rows" />;
  } else if (orders.isError && !orders.data) {
    list = <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />;
  } else {
    list = (
      <FlashList
        data={rows}
        extraData={rows.length}
        keyExtractor={(order) => order.id}
        renderItem={({ item, index }) => (
          <GroupedItem index={index} count={rows.length}>
            <OrderRow order={item} />
          </GroupedItem>
        )}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshing={refreshing}
        onRefresh={onRefresh}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: bottom }}
        ListEmptyComponent={
          search ? (
            <EmptyState
              icon="search"
              placement="top"
              title={t('empty.search.title', { search })}
              body={t('empty.search.body')}
            />
          ) : (
            <EmptyState
              icon="package"
              placement="top"
              title={t(`empty.${tab}.title`)}
              body={t(`empty.${tab}.body`)}
            />
          )
        }
        ListFooterComponent={
          <ListEnd
            loading={orders.isFetchingNextPage}
            error={orders.isFetchNextPageError || orders.isRefetchError ? orders.error : null}
            onRetry={() =>
              void (orders.isFetchNextPageError ? orders.fetchNextPage() : orders.refetch())
            }
          />
        }
      />
    );
  }

  return (
    <Screen header={<TabHeader title={t('title')} actions={<CreateOrderButton />} />}>
      <View className="gap-3 pb-3">
        <SearchField
          label={t('search')}
          value={typed}
          onChangeText={setTyped}
          maxLength={SEARCH_MAX}
          className="mx-4"
        />
        <FilterTabs
          label={t('tabsLabel')}
          tabs={tabs}
          value={tab}
          onChange={(value) => router.setParams({ tab: value })}
        />
      </View>
      {list}
    </Screen>
  );
}
