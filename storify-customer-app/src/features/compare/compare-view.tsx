import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useBottomSpace } from '@/components/shell/tab-bar';
import { AppImage } from '@/components/ui/app-image';
import { Button, TextLink } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Price } from '@/components/ui/price';
import { CompactRating } from '@/components/ui/rating';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import {
  COMPARE_MAX_PRODUCTS,
  type CompareRow,
  type ProductCard,
} from '@/contracts/mobile/shop/v1';
import { cardAction, cardAvailability } from '@/features/catalog/product-card-parts';
import { useAddFromCard } from '@/features/wishlist/use-wishlist';
import { cn } from '@/lib/cn';

import { slugsOfLink, useCompareTray } from './compare-tray';
import { useComparison } from './use-comparison';

/** A column of the table: wide enough for a name and a button, so two show at once on a phone. */
const CELL = 'w-44 px-3 py-3';
/** The line between two columns, on the side the reading starts from. */
const DIVIDER = 'border-s border-border';

/**
 * The comparison: the picked products as columns that scroll sideways, their
 * picture, name, price, rating, availability and a button, then one row per
 * specification, lined up across the columns by the store. Nothing is worked
 * out here: a cell says what the store sent, and a product that does not say
 * has "Not specified" in its place.
 *
 * `linked` is the `?products=` of a link to the website's page (or the app's):
 * those slugs become the picked ones, as they do on the website.
 */
export function CompareView({ linked }: { linked?: string }) {
  const t = useTranslations('compare');
  const bottom = useBottomSpace();
  const slugs = usePickedSlugs(linked);
  const clear = useCompareTray((tray) => tray.clear);
  const comparison = useComparison(slugs);
  useDropMissing(comparison);

  if (slugs.length === 0) {
    return (
      <EmptyState
        icon="scale"
        title={t('emptyTitle')}
        body={t('emptyBody', { max: COMPARE_MAX_PRODUCTS })}
        action={<Button label={t('browse')} onPress={() => router.push('/products')} />}
      />
    );
  }
  if (comparison.isError && !comparison.data) {
    return <ErrorState error={comparison.error} onRetry={() => void comparison.refetch()} />;
  }
  if (!comparison.data) return <LoadingState />;

  const { items, rows } = comparison.data;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 pt-4"
      contentContainerStyle={{ paddingBottom: bottom + 24 }}>
      <View className="flex-row items-end gap-3 px-4">
        <View className="flex-1 gap-1">
          <Text variant="display" accessibilityRole="header">
            {t('title')}
          </Text>
          <Text className="text-muted">{t('intro')}</Text>
        </View>
        <TextLink label={t('clear')} onPress={clear} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-4"
        className={cn(comparison.isPlaceholderData && 'opacity-60')}>
        <View className="overflow-hidden rounded-2xl bg-surface">
          <ColumnHeads items={items} />
          {rows.map((row) => (
            <SpecRow key={row.label} row={row} />
          ))}
        </View>
      </ScrollView>

      {rows.length === 0 ? (
        <Text className="px-4 text-center text-muted">{t('noSpecs')}</Text>
      ) : null}
    </ScrollView>
  );
}

/**
 * The picked products. Opened with a link’s `?products=`, those slugs are
 * what is shown at once and become the pick; the pick is the shopper’s own again
 * once the screen is closed.
 */
function usePickedSlugs(linked: string | undefined): string[] {
  const held = useCompareTray((tray) => tray.slugs);
  const adopted = useCompareTray((tray) => tray.adoptedLink);
  const adopt = useCompareTray((tray) => tray.adopt);
  const fromLink = useMemo(() => (linked === undefined ? [] : slugsOfLink(linked)), [linked]);
  const pending = linked !== undefined && adopted !== linked;

  useEffect(() => {
    if (linked !== undefined && pending) adopt(linked);
  }, [linked, pending, adopt]);
  useEffect(() => () => adopt(null), [adopt]);

  return pending ? fromLink : held;
}

/**
 * Keeps the picked products to those the store still has: a slug it no longer
 * knows is dropped from the pick, so the count on the product page tells the
 * truth. Waits for the store's own answer to the current pick.
 */
function useDropMissing(comparison: ReturnType<typeof useComparison>) {
  const replace = useCompareTray((tray) => tray.replace);
  const { data, isPlaceholderData, isSuccess } = comparison;

  useEffect(() => {
    if (!data || !isSuccess || isPlaceholderData) return;
    replace(data.items.map((item) => item.slug));
  }, [data, isSuccess, isPlaceholderData, replace]);
}

/** The first line of the table: each product, with what a shopper decides on. */
function ColumnHeads({ items }: { items: ProductCard[] }) {
  const addFromCard = useAddFromCard();
  const remove = useCompareTray((tray) => tray.remove);

  return (
    <View className="flex-row">
      {items.map((product, index) => (
        <ProductColumn
          key={product.id}
          product={product}
          first={index === 0}
          busy={addFromCard.busyProductId === product.id}
          onAdd={addFromCard.add}
          onRemove={() => remove(product.slug)}
        />
      ))}
    </View>
  );
}

type ProductColumnProps = {
  product: ProductCard;
  first: boolean;
  busy: boolean;
  onAdd: (product: ProductCard) => void;
  onRemove: () => void;
};

function ProductColumn({ product, first, busy, onAdd, onRemove }: ProductColumnProps) {
  const t = useTranslations('compare');
  const tCatalog = useTranslations('catalog');
  const tProduct = useTranslations('product');
  const action = cardAction(product);
  const availability = cardAvailability(product);

  const open = () => router.push({ pathname: '/products/[slug]', params: { slug: product.slug } });

  return (
    <View className={cn(CELL, 'justify-between gap-2', !first && DIVIDER)}>
      <View className="gap-2">
        <View>
          {/* The picture opens the product too; the name beneath it is the link a screen reader finds. */}
          <Pressable accessible={false} onPress={open} className="active:opacity-80">
            <AppImage
              image={product.image}
              size="card"
              contentFit="contain"
              className="aspect-square w-full rounded-lg bg-surface-alt p-1"
              decorative
            />
          </Pressable>
          <View className="absolute end-1 top-1">
            <IconButton
              icon="close"
              label={t('removeLabel', { name: product.name })}
              onPress={onRemove}
            />
          </View>
        </View>

        <Pressable
          accessibilityRole="link"
          accessibilityLabel={product.name}
          onPress={open}
          className="min-h-9 active:opacity-80">
          <Text variant="product" numberOfLines={2}>
            {product.name}
          </Text>
        </Pressable>

        <Price
          price={product.price}
          compareAt={product.compareAtPrice}
          from={product.priceVaries}
          onRequest={product.priceOnRequest}
        />

        {product.rating ? (
          <CompactRating rating={product.rating} showCount />
        ) : (
          <Text variant="caption">{tProduct('reviews', { count: 0 })}</Text>
        )}

        <Text
          variant="caption"
          className={cn('font-semibold', availability ? 'text-muted' : 'text-success')}>
          {availability ? tCatalog(availability) : t('inStock')}
        </Text>
      </View>

      <Button
        size="sm"
        variant={action === 'add' ? 'primary' : action === 'options' ? 'outline' : 'ghost'}
        label={
          action === 'add'
            ? tProduct('addToCart')
            : action === 'options'
              ? tProduct('chooseOptions')
              : t('view')
        }
        accessibilityHint={product.name}
        loading={busy}
        onPress={action ? () => onAdd(product) : open}
      />
    </View>
  );
}

/** One specification: its name and what each product says, in the columns' order. */
function SpecRow({ row }: { row: CompareRow }) {
  const t = useTranslations('compare');

  return (
    <View className="flex-row border-t border-border">
      {row.values.map((value, index) => (
        <View
          key={index}
          accessible
          accessibilityLabel={`${row.label}: ${value || t('notSpecified')}`}
          className={cn(CELL, 'gap-0.5', index > 0 && DIVIDER)}>
          <Text variant="caption">{row.label}</Text>
          {value ? <Text>{value}</Text> : <Text className="text-muted">{t('notSpecified')}</Text>}
        </View>
      ))}
    </View>
  );
}
