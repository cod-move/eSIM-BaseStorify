import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Chip } from '@/components/ui/chip';
import { Text } from '@/components/ui/text';
import type { BlogArticle } from '@/contracts/mobile/shop/v1';

import { ArticleBody, ArticleScroll } from './article-parts';
import { BlogCard, useByline } from './blog-card';

type BlogArticleViewProps = {
  article: BlogArticle;
  refreshing: boolean;
  onRefresh: () => void;
};

/**
 * An article of the store's blog, as a native article: its categories, title
 * and first lines, the author and date, the cover, the text, its tags, and the
 * articles related to it. A category or a tag opens the blog narrowed to it.
 */
export function BlogArticleView({ article, refreshing, onRefresh }: BlogArticleViewProps) {
  const t = useTranslations('content.blog');
  const router = useRouter();
  const byline = useByline()({ publishedAt: article.publishedAt });
  const meta = [
    byline,
    article.readingMinutes ? t('minutes', { count: article.readingMinutes }) : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
  const openBlog = (params: { category: string } | { tag: string }) =>
    router.push({ pathname: '/blog', params });

  return (
    <ArticleScroll refreshing={refreshing} onRefresh={onRefresh}>
      {article.categories.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {article.categories.map((category) => (
            <Chip
              key={category.slug}
              label={category.name}
              onPress={() => openBlog({ category: category.slug })}
            />
          ))}
        </View>
      ) : null}

      <View className="gap-3">
        <Text variant="display" accessibilityRole="header">
          {article.title}
        </Text>
        {article.excerpt ? (
          <Text variant="long" className="text-muted">
            {article.excerpt}
          </Text>
        ) : null}
      </View>

      {article.authorName || meta ? (
        <View className="flex-row items-center gap-3 border-t border-border pt-4">
          {article.authorImage ? (
            <AppImage
              image={article.authorImage}
              size="thumb"
              className="size-10 rounded-full bg-surface"
              decorative
            />
          ) : null}
          <View className="flex-1 gap-0.5">
            {article.authorName ? <Text variant="label">{article.authorName}</Text> : null}
            {meta ? <Text variant="caption">{meta}</Text> : null}
          </View>
        </View>
      ) : null}

      {article.image ? (
        <AppImage
          image={article.image}
          size="full"
          aspectRatio={16 / 9}
          className="w-full rounded-2xl bg-surface"
        />
      ) : null}

      <ArticleBody html={article.html} />

      {article.tags.length > 0 ? (
        <View className="flex-row flex-wrap gap-2 border-t border-border pt-4">
          {article.tags.map((tag) => (
            <Chip key={tag} label={t('tag', { tag })} onPress={() => openBlog({ tag })} />
          ))}
        </View>
      ) : null}

      {article.related.length > 0 ? (
        <View className="gap-4 pt-2">
          <Text variant="heading" accessibilityRole="header">
            {t('related')}
          </Text>
          {article.related.map((related) => (
            <BlogCard key={related.id} article={related} />
          ))}
        </View>
      ) : null}
    </ArticleScroll>
  );
}
