import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { BlogArticleView } from '@/features/content/blog-article-view';
import { useBlogArticle } from '@/features/content/use-content';
import { isGone, useWebFallback } from '@/features/content/web-fallback';
import { SharePageButton } from '@/features/vendors/share-page-button';

/** `/blog/{slug}`: an article of the store's blog, as on the website. */
export default function BlogArticleScreen() {
  const t = useTranslations('content');
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const path = `/blog/${encodeURIComponent(slug)}`;
  const article = useBlogArticle(slug);
  const fallback = useWebFallback(path, article.error);
  const shown = article.data;

  return (
    <>
      <Stack.Screen
        options={{
          title: t('titles.blog'),
          headerRight: shown
            ? () => <SharePageButton path={path} title={shown.title} />
            : undefined,
        }}
      />
      {article.isPending || fallback ? (
        <LoadingState />
      ) : article.isError ? (
        isGone(article.error) ? (
          <EmptyState icon="list" title={t('blog.notFoundTitle')} body={t('blog.notFoundBody')} />
        ) : (
          <ErrorState error={article.error} onRetry={() => void article.refetch()} />
        )
      ) : (
        <BlogArticleView
          article={article.data}
          refreshing={article.isRefetching}
          onRefresh={() => void article.refetch()}
        />
      )}
    </>
  );
}
