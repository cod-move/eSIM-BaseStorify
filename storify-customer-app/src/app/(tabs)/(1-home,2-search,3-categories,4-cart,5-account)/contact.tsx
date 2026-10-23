import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

import { ErrorState, LoadingState, EmptyState } from '@/components/ui/state-view';
import { ContactView } from '@/features/content/info-pages';
import { useContactPage } from '@/features/content/use-content';
import { isGone, useWebFallback } from '@/features/content/web-fallback';

/** `/contact`: the store's ways to be reached, and its contact form, as on the website. */
export default function ContactScreen() {
  const t = useTranslations('content');
  const page = useContactPage();
  const fallback = useWebFallback('/contact', page.error, t('titles.contact'));

  return (
    <>
      <Stack.Screen options={{ title: t('titles.contact') }} />
      {page.isPending || fallback ? (
        <LoadingState />
      ) : page.isError ? (
        isGone(page.error) ? (
          <EmptyState icon="help" title={t('notFoundTitle')} body={t('notFoundBody')} />
        ) : (
          <ErrorState error={page.error} onRetry={() => void page.refetch()} />
        )
      ) : (
        <ContactView
          page={page.data}
          refreshing={page.isRefetching}
          onRefresh={() => void page.refetch()}
        />
      )}
    </>
  );
}
