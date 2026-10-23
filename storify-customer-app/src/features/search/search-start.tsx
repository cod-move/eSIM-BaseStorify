import { Link, useRouter } from 'expo-router';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { TextLink } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { SectionHeader } from '@/components/ui/section-header';
import { Text } from '@/components/ui/text';
import type { Category } from '@/contracts/mobile/shop/v1';
import { ProductCard } from '@/features/catalog/product-card';
import { useCardActions } from '@/features/catalog/use-add-from-card';
import { categoryHref } from '@/features/categories/category-href';
import { useCategories } from '@/features/categories/use-categories';

import { useRecentSearches } from './recent-searches';
import { useForYou, useSearchStart } from './use-search-start';

type SearchStartProps = {
  /** Searches for a term as typed (a recent or a trending one). */
  onSearch: (term: string) => void;
  /** The shopper began to scroll the page. */
  onScrollStart: () => void;
  /** Room left at the bottom for the floating tab bar. */
  bottomSpace: number;
};

/**
 * What the Search tab shows before anything is typed: the categories as
 * chips, the recent searches, the store's trending terms, "Popular Category"
 * and "For You". A section the store sends nothing for, or that fails to
 * load, is left out: the field above still works.
 */
export function SearchStart({ onSearch, onScrollStart, bottomSpace }: SearchStartProps) {
  const t = useTranslations('search');
  const router = useRouter();
  const categories = useCategories().data ?? [];
  const start = useSearchStart().data;
  const trending = start?.trending ?? [];
  const popular = start?.popularCategories ?? [];

  return (
    <ScrollView
      className="flex-1"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onScrollBeginDrag={onScrollStart}
      contentContainerClassName="gap-6 pt-4"
      contentContainerStyle={{ paddingBottom: bottomSpace }}>
      {categories.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="gap-2 px-4">
          {categories.map((category, index) => (
            <Chip
              key={category.id}
              kind="picture"
              ink={index === 0}
              label={category.name}
              image={category.image}
              className="min-h-9"
              onPress={() => router.push(categoryHref(category))}
            />
          ))}
        </ScrollView>
      ) : null}

      <RecentSearches onSearch={onSearch} />

      {trending.length > 0 ? (
        <View className="gap-3">
          <Text variant="heading" accessibilityRole="header" className="px-4">
            {t('trendingTitle')}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="gap-2 px-4">
            {trending.map((term) => (
              <Chip key={term} label={term} className="min-h-9" onPress={() => onSearch(term)} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {popular.length > 0 ? (
        <View className="gap-3 px-4">
          <SectionHeader title={t('popularTitle')} onViewAll={() => router.push('/categories')} />
          <View className="flex-row flex-wrap gap-y-2">
            {popular.map((category, index) => (
              <View key={category.id} className={index % 2 === 0 ? 'w-1/2 pe-1' : 'w-1/2 ps-1'}>
                <PopularCategory category={category} />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <ForYou />
    </ScrollView>
  );
}

function PopularCategory({ category }: { category: Category }) {
  return (
    <Link href={categoryHref(category)} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={category.name}
        className="h-[62px] flex-row items-center gap-2 overflow-hidden rounded-xl bg-surface ps-4 active:opacity-80">
        <Text variant="product" numberOfLines={2} className="flex-1">
          {category.name}
        </Text>
        <AppImage
          image={category.image}
          size="thumb"
          contentFit="contain"
          className="me-1.5 size-[50px] rounded-lg bg-transparent"
          decorative
        />
      </Pressable>
    </Link>
  );
}

/** The shopper's recent searches, each removable, with "Clear all". Hidden while there are none. */
function RecentSearches({ onSearch }: { onSearch: (term: string) => void }) {
  const t = useTranslations('search');
  const { terms, remove, clear } = useRecentSearches();
  if (terms.length === 0) return null;

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between gap-4 px-4">
        <Text variant="heading" accessibilityRole="header" className="shrink">
          {t('recentTitle')}
        </Text>
        <TextLink
          label={t('clearRecent')}
          accessibilityLabel={t('clearRecentLabel')}
          onPress={clear}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-2 px-4">
        {terms.map((term) => (
          <View
            key={term}
            className="h-9 flex-row items-center rounded-full bg-surface ps-3 dark:bg-surface-alt">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('searchAgain', { term })}
              hitSlop={{ top: 4, bottom: 4 }}
              onPress={() => onSearch(term)}
              className="h-full flex-row items-center gap-1.5 active:opacity-60">
              <Icon name="search" size={14} colorClassName="accent-muted" />
              <Text variant="chip" numberOfLines={1}>
                {term}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('removeRecent', { term })}
              hitSlop={{ top: 4, bottom: 4 }}
              onPress={() => remove(term)}
              className="size-9 items-center justify-center rounded-full active:opacity-60">
              <Icon name="close" size={14} colorClassName="accent-muted" />
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/** "For You": the products the store picked for this shopper, as a rail. A guest has none. */
function ForYou() {
  const t = useTranslations('search');
  const cardActions = useCardActions();
  const products = useForYou().data?.forYou ?? [];
  if (products.length === 0) return null;

  return (
    <View className="gap-3">
      <SectionHeader title={t('forYouTitle')} className="px-4" />
      <FlatList
        horizontal
        data={products}
        keyExtractor={(product) => product.id}
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-3 px-4"
        renderItem={({ item }) => (
          <ProductCard product={item} variant="rail" className="w-[140px]" {...cardActions(item)} />
        )}
      />
    </View>
  );
}
