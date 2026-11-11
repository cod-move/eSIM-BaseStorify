import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

import { ErrorState, LoadingState, EmptyState } from '@/components/ui/state-view';
import { ReturnPolicyView } from '@/features/content/info-pages';
import { useReturnPolicy } from '@/features/content/use-content';
import { isGone, useWebFallback } from '@/features/content/web-fallback';

/** `/returns`: the store's return policy, as on the website. */
export default function ReturnsScreen() {
  const t = useTranslations('content');
  const page = useReturnPolicy();
  const fallback = useWebFallback('/returns', page.error, t('titles.returns'));

  return (
    <>
      <Stack.Screen options={{ title: t('titles.returns') }} />
      {page.isPending || fallback ? (
        <LoadingState />
      ) : page.isError ? (
        isGone(page.error) ? (
          <EmptyState icon="help" title={t('notFoundTitle')} body={t('notFoundBody')} />
        ) : (
          <ErrorState error={page.error} onRetry={() => void page.refetch()} />
        )
      ) : (
        <ReturnPolicyView
          page={page.data}
          refreshing={page.isRefetching}
          onRefresh={() => void page.refetch()}
        />
      )}
    </>
  );
}
