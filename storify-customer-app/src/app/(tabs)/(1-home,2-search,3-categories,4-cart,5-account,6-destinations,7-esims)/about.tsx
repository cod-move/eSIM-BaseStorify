import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

import { ErrorState, LoadingState, EmptyState } from '@/components/ui/state-view';
import { AboutView } from '@/features/content/info-pages';
import { useAboutPage } from '@/features/content/use-content';
import { isGone, useWebFallback } from '@/features/content/web-fallback';

/** `/about`: the store's About page, as on the website. */
export default function AboutScreen() {
  const t = useTranslations('content');
  const page = useAboutPage();
  const fallback = useWebFallback('/about', page.error, t('titles.about'));

  return (
    <>
      <Stack.Screen options={{ title: t('titles.about') }} />
      {page.isPending || fallback ? (
        <LoadingState />
      ) : page.isError ? (
        isGone(page.error) ? (
          <EmptyState icon="help" title={t('notFoundTitle')} body={t('notFoundBody')} />
        ) : (
          <ErrorState error={page.error} onRetry={() => void page.refetch()} />
        )
      ) : (
        <AboutView
          page={page.data}
          refreshing={page.isRefetching}
          onRefresh={() => void page.refetch()}
        />
      )}
    </>
  );
}
