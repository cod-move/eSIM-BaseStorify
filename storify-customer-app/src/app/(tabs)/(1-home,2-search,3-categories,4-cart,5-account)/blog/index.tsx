import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';

import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { BlogList } from '@/features/content/blog-list';
import { useBlogArticles } from '@/features/content/use-content';
import { useWebFallback } from '@/features/content/web-fallback';

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) || undefined;

/** `/blog`: the store's articles, as on the website; `?category=` and `?tag=` narrow them. */
export default function BlogScreen() {
  const t = useTranslations('content');
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; tag?: string }>();
  const category = first(params.category);
  const tag = first(params.tag);
  const blog = useBlogArticles({ category, tag });
  const search = new URLSearchParams({
    ...(category ? { category } : {}),
    ...(tag ? { tag } : {}),
  }).toString();
  const fallback = useWebFallback(`/blog${search ? `?${search}` : ''}`, blog.error);
  const title = tag ? t('blog.tag', { tag }) : t('titles.blog');

  return (
    <>
      <Stack.Screen options={{ title }} />
      {blog.isPending || fallback ? (
        <LoadingState />
      ) : blog.isError ? (
        <ErrorState error={blog.error} onRetry={() => void blog.refetch()} />
      ) : blog.data.articles.length === 0 && blog.data.categories.length === 0 ? (
        <EmptyState icon="list" title={t('blog.emptyTitle')} body={t('blog.emptyBody')} />
      ) : (
        <BlogList
          articles={blog.data.articles}
          categories={blog.data.categories}
          selected={category}
          onSelect={(slug) => router.setParams({ category: slug })}
          refreshing={blog.isRefetching && !blog.isFetchingNextPage}
          onRefresh={() => void blog.refetch()}
          onEndReached={() => {
            if (blog.hasNextPage && !blog.isFetchingNextPage) void blog.fetchNextPage();
          }}
          loadingMore={blog.isFetchingNextPage}
          empty={<EmptyState icon="list" title={t('blog.emptyTitle')} />}
        />
      )}
    </>
  );
}
