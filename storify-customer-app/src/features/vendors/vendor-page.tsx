import { FlashList } from '@shopify/flash-list';
import { Link } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { useBottomSpace } from '@/components/shell/tab-bar';
import { AppImage } from '@/components/ui/app-image';
import { Icon } from '@/components/ui/icon';
import { CompactRating } from '@/components/ui/rating';
import { SearchField } from '@/components/ui/search-field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import type { VendorDetail } from '@/contracts/mobile/shop/v1';
import { useListing } from '@/features/browse/use-browse';
import { ProductCard } from '@/features/catalog/product-card';
import { useCardActions } from '@/features/catalog/use-add-from-card';

import { useVendorCategories, type VendorCategory } from './use-vendor-page';

const COLUMNS = 3;

/**
 * A seller's page (`/vendors/{slug}`): the cover, the logo, name and facts,
 * the categories the seller sells in, then the seller's products, with a
 * search that looks among this seller's products only.
 */
export function VendorPage({ vendor }: { vendor: VendorDetail }) {
  const t = useTranslations('vendor');
  const browse = useTranslations('browse');
  const bottom = useBottomSpace();
  const cardActions = useCardActions();
  const [typed, setTyped] = useState('');
  const [term, setTerm] = useState<string | undefined>(undefined);
  const list = useListing({ vendor: vendor.slug, q: term });
  const categories = useVendorCategories(vendor.slug);

  // The grid pads its sides by 8; the header stands on the page's 16 pt gutter.
  const header = (
    <View className="-mx-2 gap-5 pb-2">
      <VendorProfile vendor={vendor} />
      {categories.length > 0 ? (
        <CategoryTiles vendor={vendor.slug} categories={categories} />
      ) : null}
      <View className="gap-3 px-4">
        <Text variant="heading" accessibilityRole="header">
          {t('products')}
        </Text>
        <SearchField
          label={t('searchLabel')}
          placeholder={t('searchPlaceholder', { name: vendor.name })}
          value={typed}
          onChangeText={(text) => {
            setTyped(text);
            if (!text) setTerm(undefined);
          }}
          onSubmit={(text) => setTerm(text.trim() || undefined)}
        />
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <FlashList
        data={list.data?.cards ?? []}
        numColumns={2}
        keyExtractor={(product) => product.id}
        renderItem={({ item }) => (
          <ProductCard product={item} className="m-2 flex-1" {...cardActions(item)} />
        )}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: bottom + 16 }}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        refreshing={list.isRefetching && !list.isFetchingNextPage}
        onRefresh={() => void list.refetch()}
        ListEmptyComponent={
          list.isPending ? (
            <LoadingState />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          ) : term ? (
            <EmptyState icon="search" title={browse('emptyTitle')} body={browse('emptyBody')} />
          ) : (
            <EmptyState title={t('noProducts')} />
          )
        }
        ListFooterComponent={
          list.isFetchingNextPage ? (
            <View className="p-4">
              <ActivityIndicator colorClassName="accent-muted" />
            </View>
          ) : null
        }
      />
    </View>
  );
}

/** The cover across the page, the round logo over its lower start corner, then who the seller is. */
function VendorProfile({ vendor }: { vendor: VendorDetail }) {
  const t = useTranslations('vendor');
  const search = useTranslations('search');
  const format = useFormatter();

  return (
    <View>
      <AppImage
        image={vendor.banner}
        size="full"
        aspectRatio={2.4}
        className="w-full bg-surface-alt"
        decorative
      />
      <View className="gap-2 px-4">
        <AppImage
          image={vendor.logo}
          size="thumb"
          contentFit="contain"
          className="-mt-10 size-20 rounded-full border-4 border-background bg-surface"
          decorative
        />
        <View className="flex-row items-center gap-1.5">
          <Text variant="display" accessibilityRole="header" numberOfLines={2} className="shrink">
            {vendor.name}
          </Text>
          {vendor.verified ? (
            <View accessible accessibilityRole="image" accessibilityLabel={search('verified')}>
              <Icon name="check-circle" size={20} colorClassName="accent-primary" />
            </View>
          ) : null}
        </View>
        <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
          {vendor.rating ? <CompactRating rating={vendor.rating} showCount size="sm" /> : null}
          <Text variant="caption">{search('productCount', { count: vendor.productCount })}</Text>
          <Text variant="caption">{search('unitsSold', { count: vendor.unitsSold })}</Text>
          {vendor.location ? <Text variant="caption">{vendor.location}</Text> : null}
        </View>
        {vendor.memberSince ? (
          <Text variant="caption">
            {t('memberSince', {
              date: format.dateTime(new Date(vendor.memberSince), {
                year: 'numeric',
                month: 'long',
              }),
            })}
          </Text>
        ) : null}
        {vendor.description ? (
          <Text className="text-muted" numberOfLines={4}>
            {vendor.description}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** The seller's categories, three to a row; a tile lists this seller's products in it. */
function CategoryTiles({ vendor, categories }: { vendor: string; categories: VendorCategory[] }) {
  const t = useTranslations('vendor');

  return (
    <View className="gap-3 px-4">
      <Text variant="heading" accessibilityRole="header">
        {t('categories')}
      </Text>
      {rowsOf(categories).map((row) => (
        <View key={row.map((category) => category.slug).join('|')} className="flex-row gap-3">
          {row.map((category) => (
            <Link
              key={category.slug}
              href={{ pathname: '/products', params: { category: category.slug, vendor } }}
              asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={category.name}
                className="flex-1 items-center gap-2 rounded-xl bg-surface p-3 active:opacity-80">
                <AppImage
                  image={category.image}
                  size="thumb"
                  contentFit="contain"
                  className="aspect-square w-full bg-transparent"
                  decorative
                />
                <Text variant="chip" numberOfLines={1} className="text-center">
                  {category.name}
                </Text>
              </Pressable>
            </Link>
          ))}
          {Array.from({ length: COLUMNS - row.length }, (_, index) => (
            <View key={index} className="flex-1" />
          ))}
        </View>
      ))}
    </View>
  );
}

function rowsOf<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let start = 0; start < items.length; start += COLUMNS) {
    rows.push(items.slice(start, start + COLUMNS));
  }
  return rows;
}
