import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { FaqView } from '@/features/content/faq-view';
import { useFaq } from '@/features/content/use-content';
import { isGone, useWebFallback } from '@/features/content/web-fallback';

/** `/faq`: the store's questions and answers, as on the website. */
export default function FaqScreen() {
  const t = useTranslations('content');
  const faq = useFaq();
  const fallback = useWebFallback('/faq', faq.error, t('titles.faq'));

  return (
    <>
      <Stack.Screen options={{ title: t('titles.faq') }} />
      {faq.isPending || fallback ? (
        <LoadingState />
      ) : faq.isError ? (
        isGone(faq.error) ? (
          <EmptyState icon="help" title={t('notFoundTitle')} body={t('notFoundBody')} />
        ) : (
          <ErrorState error={faq.error} onRetry={() => void faq.refetch()} />
        )
      ) : faq.data.items.length === 0 ? (
        <EmptyState icon="help" title={t('faqEmptyTitle')} />
      ) : (
        <FaqView
          faq={faq.data}
          refreshing={faq.isRefetching}
          onRefresh={() => void faq.refetch()}
        />
      )}
    </>
  );
}
