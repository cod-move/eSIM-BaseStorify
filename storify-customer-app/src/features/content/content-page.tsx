import { Stack } from 'expo-router';
import { useFormatter, useTranslations } from 'use-intl';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import type { ContentPage } from '@/contracts/mobile/shop/v1';

import { ArticleBody, ArticleScroll, ArticleTitle } from './article-parts';
import { useContentPage } from './use-content';
import { isGone, useWebFallback } from './web-fallback';

/** The pages with a name of the app's own, for the header while the page loads. */
const KNOWN_TITLES = ['privacy', 'terms', 'cookies', 'accessibility'] as const;
type KnownTitle = (typeof KNOWN_TITLES)[number];
const isKnown = (handle: string): handle is KnownTitle =>
  (KNOWN_TITLES as readonly string[]).includes(handle);

type ContentPageViewProps = {
  page: ContentPage;
  refreshing: boolean;
  onRefresh: () => void;
};

/** A page the merchant writes, as a native article: its title, when it changed, its text. */
export function ContentPageView({ page, refreshing, onRefresh }: ContentPageViewProps) {
  const t = useTranslations('content');
  const format = useFormatter();
  const updated = page.updatedAt
    ? t('updated', { date: format.dateTime(new Date(page.updatedAt), { dateStyle: 'medium' }) })
    : undefined;

  return (
    <ArticleScroll refreshing={refreshing} onRefresh={onRefresh}>
      <ArticleTitle title={page.title} meta={updated} />
      <ArticleBody html={page.html} />
    </ArticleScroll>
  );
}

/**
 * The screen of a page the merchant writes, at the website's own address
 * (`path`: `/privacy`, `/pages/shipping`). A store that cannot send the page
 * opens the website's instead (`useWebFallback`).
 */
export function ContentPageScreen({ handle, path }: { handle: string; path: string }) {
  const t = useTranslations('content');
  const page = useContentPage(handle);
  const known = isKnown(handle) ? t(`titles.${handle}`) : undefined;
  const fallback = useWebFallback(path, page.error, known);

  return (
    <>
      <Stack.Screen options={{ title: page.data?.title ?? known ?? '' }} />
      {page.isPending || fallback ? (
        <LoadingState />
      ) : page.isError ? (
        isGone(page.error) ? (
          <EmptyState icon="help" title={t('notFoundTitle')} body={t('notFoundBody')} />
        ) : (
          <ErrorState error={page.error} onRetry={() => void page.refetch()} />
        )
      ) : (
        <ContentPageView
          page={page.data}
          refreshing={page.isRefetching}
          onRefresh={() => void page.refetch()}
        />
      )}
    </>
  );
}
