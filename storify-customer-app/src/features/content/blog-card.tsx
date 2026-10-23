import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Text } from '@/components/ui/text';
import type { BlogArticleSummary } from '@/contracts/mobile/shop/v1';

/** "By Mira Hasan · 18 Sep 2026", or the part of it the article has. */
export function useByline(): (article: {
  authorName?: string;
  publishedAt?: string;
}) => string | undefined {
  const t = useTranslations('content.blog');
  const format = useFormatter();
  return ({ authorName, publishedAt }) => {
    const date = publishedAt
      ? format.dateTime(new Date(publishedAt), { dateStyle: 'medium' })
      : undefined;
    if (authorName && date) return t('byDate', { author: authorName, date });
    if (authorName) return t('by', { author: authorName });
    return date;
  };
}

type BlogCardProps = {
  article: BlogArticleSummary;
  /** The first article of the list: a wider picture and a larger title. */
  featured?: boolean;
};

/** An article in a list: its cover, title, the first lines and its byline. A tap opens it. */
export function BlogCard({ article, featured = false }: BlogCardProps) {
  const router = useRouter();
  const byline = useByline()(article);

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={article.title}
      onPress={() => router.push({ pathname: '/blog/[slug]', params: { slug: article.slug } })}
      className="gap-2 active:opacity-80">
      {article.image ? (
        <AppImage
          image={article.image}
          size={featured ? 'full' : 'card'}
          aspectRatio={16 / 9}
          className="w-full rounded-xl bg-surface"
          decorative
        />
      ) : null}
      <View className="gap-1">
        <Text variant={featured ? 'heading' : 'subheading'} numberOfLines={3}>
          {article.title}
        </Text>
        {article.excerpt ? (
          <Text variant="body" className="text-muted" numberOfLines={featured ? 3 : 2}>
            {article.excerpt}
          </Text>
        ) : null}
        {byline ? <Text variant="caption">{byline}</Text> : null}
      </View>
    </Pressable>
  );
}
