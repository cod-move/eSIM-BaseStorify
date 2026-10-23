import { FlashList } from '@shopify/flash-list';
import type { ReactNode } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Chip } from '@/components/ui/chip';
import type { BlogArticleCategory, BlogArticleSummary } from '@/contracts/mobile/shop/v1';

import { BlogCard } from './blog-card';

type CategoryChipsProps = {
  categories: BlogArticleCategory[];
  /** The chosen category's slug; none for every article. */
  selected: string | undefined;
  onSelect: (slug: string | undefined) => void;
};

/** "All" and the blog's categories, in a row that scrolls. */
export function CategoryChips({ categories, selected, onSelect }: CategoryChipsProps) {
  const t = useTranslations('content.blog');
  if (categories.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 px-4 py-3">
      <Chip label={t('all')} selected={!selected} onPress={() => onSelect(undefined)} />
      {categories.map((category) => (
        <Chip
          key={category.slug}
          label={category.name}
          selected={selected === category.slug}
          onPress={() => onSelect(category.slug)}
        />
      ))}
    </ScrollView>
  );
}

type BlogListProps = CategoryChipsProps & {
  articles: BlogArticleSummary[];
  refreshing: boolean;
  onRefresh: () => void;
  onEndReached: () => void;
  loadingMore: boolean;
  /** Shown under the categories when no article is in the one chosen. */
  empty: ReactNode;
};

/** The blog: its categories above, then its articles, the newest first and largest. */
export function BlogList({
  articles,
  categories,
  selected,
  onSelect,
  refreshing,
  onRefresh,
  onEndReached,
  loadingMore,
  empty,
}: BlogListProps) {
  const bottom = useTabBarHeight();

  return (
    <View className="flex-1 bg-background">
      <FlashList
        data={articles}
        keyExtractor={(article) => article.id}
        ListHeaderComponent={
          <CategoryChips categories={categories} selected={selected} onSelect={onSelect} />
        }
        renderItem={({ item, index }) => (
          <View className="px-4 pb-6">
            <BlogCard article={item} featured={index === 0} />
          </View>
        )}
        contentContainerStyle={{ paddingBottom: bottom + 16 }}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={<View className="pt-12">{empty}</View>}
        ListFooterComponent={
          loadingMore ? (
            <View className="p-4">
              <ActivityIndicator colorClassName="accent-muted" />
            </View>
          ) : null
        }
      />
    </View>
  );
}
