import { Pressable, ScrollView, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { EdgeFade } from '@/components/ui/edge-fade';
import { Text } from '@/components/ui/text';
import type { ArticleListBlock } from '@/contracts/mobile/shop/v1';
import { useOpenLink } from '@/features/config/use-open-link';

import { BlockTitle } from './block-title';

/** The newest articles of the store's blog, as cards in a row that scrolls; a card opens its link. */
export function ArticleList({ block }: { block: ArticleListBlock }) {
  const t = useTranslations('home.blocks.articleList');
  const format = useFormatter();
  const openLink = useOpenLink();
  if (block.articles.length === 0) return null;

  return (
    <View className="gap-3">
      {block.title ? <BlockTitle title={block.title} /> : null}
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3 px-4">
          {block.articles.map((article) => (
            <Pressable
              key={article.id}
              accessibilityRole="link"
              accessibilityLabel={article.title}
              onPress={() => openLink(article.href)}
              className="w-65 gap-2 active:opacity-80">
              {article.image ? (
                <AppImage
                  image={article.image}
                  size="card"
                  aspectRatio={16 / 9}
                  className="w-full rounded-xl"
                  decorative
                />
              ) : null}
              <Text variant="product" numberOfLines={2}>
                {article.title}
              </Text>
              {article.excerpt ? (
                <Text variant="caption" numberOfLines={3}>
                  {article.excerpt}
                </Text>
              ) : null}
              <Text variant="caption">
                {article.publishedAt
                  ? t('byDate', {
                      author: article.authorName,
                      date: format.dateTime(new Date(article.publishedAt), { dateStyle: 'medium' }),
                    })
                  : t('by', { author: article.authorName })}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <EdgeFade />
      </View>
    </View>
  );
}
