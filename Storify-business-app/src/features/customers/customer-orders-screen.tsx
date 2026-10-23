import { FlashList } from '@shopify/flash-list';
import { useTranslations } from 'use-intl';

import { GroupedItem, ListEnd } from '@/components/ui/list-group';
import { Screen, StackHeader, useBottomSpace } from '@/components/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { OrderRow } from '@/features/orders/order-row';
import { useOrders } from '@/features/orders/use-orders';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';
import { useRefetchOnFocus } from '@/lib/use-refetch-on-focus';

import { useCustomer } from './use-customers';

/**
 * Every order of one customer the operator can see (GET /orders?customerId=),
 * newest first, as the order list draws them: for a seller, only their own
 * consignments, never what the customer bought elsewhere.
 */
export function CustomerOrdersScreen({ id }: { id: string }) {
  const t = useTranslations('customers');
  const customer = useCustomer(id);
  const orders = useOrders({ tab: 'all', customerId: id });
  const bottom = useBottomSpace();
  useRefetchOnFocus(orders.refetch);
  const { refreshing, onRefresh } = usePullToRefresh(orders.refetch);
  const rows = orders.data ?? [];

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
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: bottom }}
        ListHeaderComponent={
          customer.data ? (
            <Text variant="heading" className="px-1 pb-3">
              {customer.data.name}
            </Text>
          ) : null
        }
        ListEmptyComponent={<EmptyState icon="receipt" placement="top" title={t('noOrders')} />}
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

  return <Screen header={<StackHeader title={t('ordersTitle')} icon="receipt" />}>{list}</Screen>;
}
