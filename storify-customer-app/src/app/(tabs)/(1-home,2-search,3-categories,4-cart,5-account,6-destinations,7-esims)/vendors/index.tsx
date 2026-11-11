import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { useVendors } from '@/features/vendors/use-vendors';
import { VendorList } from '@/features/vendors/vendor-list';

/**
 * Every seller of the store, as on the website: `/vendors`. A store with one
 * seller has no such list, and the screen says so.
 */
export default function VendorsScreen() {
  const t = useTranslations('vendor');
  const vendors = useVendors();

  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      {vendors.available === false ? (
        <EmptyState icon="grid" title={t('unavailableTitle')} body={t('unavailableBody')} />
      ) : vendors.available === undefined || vendors.isPending ? (
        <LoadingState />
      ) : vendors.isError ? (
        <ErrorState error={vendors.error} onRetry={() => void vendors.refetch()} />
      ) : vendors.data.length === 0 ? (
        <EmptyState icon="grid" title={t('emptyTitle')} body={t('emptyBody')} />
      ) : (
        <VendorList
          vendors={vendors.data}
          refreshing={vendors.isRefetching && !vendors.isFetchingNextPage}
          onRefresh={() => void vendors.refetch()}
          onEndReached={() => {
            if (vendors.hasNextPage && !vendors.isFetchingNextPage) void vendors.fetchNextPage();
          }}
          loadingMore={vendors.isFetchingNextPage}
        />
      )}
    </>
  );
}
