import { Stack, useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';

import { HeaderTitle } from '@/components/shell/app-header';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { AccountPicture } from '@/features/account/account-parts';
import { OrderList } from '@/features/orders/order-list';
import { useActiveOrders } from '@/features/orders/use-orders';

/** `/account/tracking`: "Track Orders", the orders not yet delivered. Signed-in shoppers only. */
export default function TrackOrdersScreen() {
  const t = useTranslations('orders');
  const router = useRouter();
  const orders = useActiveOrders();

  const body = () => {
    if (orders.isPending || orders.searching) return <LoadingState />;
    if (orders.isError) {
      return <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />;
    }
    if (orders.active.length === 0) {
      return (
        <EmptyState
          icon="truck"
          title={t('activeEmptyTitle')}
          body={t('activeEmptyBody')}
          action={
            <Button label={t('seeHistory')} onPress={() => router.replace('/account/orders')} />
          }
        />
      );
    }
    return (
      <OrderList
        orders={orders.active}
        hasMore={orders.hasNextPage}
        loadingMore={orders.isFetchingNextPage}
        onMore={() => void orders.fetchNextPage()}
      />
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <HeaderTitle
              picture={<AccountPicture name="tracking" className="size-7" />}
              title={t('trackingTitle')}
            />
          ),
        }}
      />
      {body()}
    </>
  );
}
