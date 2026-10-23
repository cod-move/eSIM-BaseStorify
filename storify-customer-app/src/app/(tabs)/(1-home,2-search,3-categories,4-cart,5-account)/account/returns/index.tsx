import { Stack, useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { ReturnList } from '@/features/returns/return-list';
import { useMyReturns } from '@/features/returns/use-returns';

/** The shopper's returns, newest first. Signed-in shoppers only; the store checks it too. */
export default function ReturnsScreen() {
  const t = useTranslations('returns');
  const router = useRouter();
  const returns = useMyReturns();

  const body = () => {
    if (returns.isPending) return <LoadingState />;
    if (returns.isError) {
      return <ErrorState error={returns.error} onRetry={() => void returns.refetch()} />;
    }
    if (returns.data.length === 0) {
      return (
        <EmptyState
          icon="return"
          title={t('emptyTitle')}
          body={t('emptyBody')}
          action={<Button label={t('toOrders')} onPress={() => router.push('/account/orders')} />}
        />
      );
    }
    return (
      <ReturnList
        returns={returns.data}
        hasMore={returns.hasNextPage}
        loadingMore={returns.isFetchingNextPage}
        onMore={() => void returns.fetchNextPage()}
      />
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      {body()}
    </>
  );
}
