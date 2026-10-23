import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Button } from '@/components/ui/button';
import { Price } from '@/components/ui/price';
import { GroupFootnote, ListRow, RowGroup, SectionLabel, ValueRow } from '@/components/ui/rows';
import { ActionBar, Screen, StackHeader } from '@/components/ui/screen';
import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import type { ProductDetail } from '@/contracts/mobile/biz/v1';
import { ProductStatusChip, StockStatusChip } from '@/features/status/status-chip';
import { useCan } from '@/features/workspace/use-workspace';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';
import { useRefetchOnFocus } from '@/lib/use-refetch-on-focus';

import { ProductEditSheet } from './product-edit-sheet';
import { useStockWords } from './product-row';
import { useProduct } from './use-products';

/**
 * A product: its pictures, name, codes, status and
 * stock at a glance; its price or its variants' prices; its units per
 * location. The action bar edits the price and status (`EDIT_PRODUCTS`) and
 * opens the stock (`VIEW_STOCK`).
 */
export function ProductScreen({ id, code }: { id: string; code?: string }) {
  const t = useTranslations('products');
  const titles = useTranslations('shell.titles');
  const format = useFormatter();
  const product = useProduct(id);
  const canEdit = useCan('EDIT_PRODUCTS');
  const canSeeStock = useCan('VIEW_STOCK');
  const [editing, setEditing] = useState(false);
  const { refetch } = product;
  useRefetchOnFocus(refetch);
  const { refreshing, onRefresh } = usePullToRefresh(refetch);

  const data = product.data;
  const header = <StackHeader title={data?.name ?? titles('product')} />;

  if (!data) {
    return (
      <Screen header={header}>
        {product.isError ? (
          <ErrorState error={product.error} onRetry={() => void refetch()} />
        ) : (
          <LoadingState shape="rows" />
        )}
      </Screen>
    );
  }

  const footer =
    canEdit || canSeeStock ? (
      <ActionBar>
        <View className="flex-row gap-3">
          {canEdit ? (
            <Button label={t('detail.edit')} onPress={() => setEditing(true)} className="flex-1" />
          ) : null}
          {canSeeStock ? (
            <Button
              label={t('detail.openStock')}
              icon="boxes"
              variant={canEdit ? 'secondary' : 'primary'}
              onPress={() =>
                router.push({ pathname: '/products/[id]/stock', params: { id: data.id } })
              }
              className="flex-1"
            />
          ) : null}
        </View>
      </ActionBar>
    ) : undefined;

  return (
    <Screen
      header={header}
      scroll
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={footer}
      contentClassName="gap-6 px-4 pt-2">
      <Summary product={data} />
      {canEdit ? (
        <Button
          label={t('editor.openFull')}
          variant="secondary"
          onPress={() => router.push({ pathname: '/products/[id]/edit', params: { id: data.id } })}
        />
      ) : null}
      {data.variants.length === 0 ? (
        <Pricing product={data} />
      ) : (
        <Variants product={data} code={code} />
      )}
      <Stock product={data} />
      <Text variant="caption" className="px-4">
        {t('detail.updated', {
          date: format.dateTime(new Date(data.updatedAt), {
            dateStyle: 'medium',
            timeStyle: 'short',
          }),
        })}
      </Text>
      {canEdit ? (
        <ProductEditSheet visible={editing} product={data} onClose={() => setEditing(false)} />
      ) : null}
    </Screen>
  );
}

/** How the product's stock reads on its chip: none for a product whose stock is not counted. */
function stockStatusOf(product: ProductDetail): string | null {
  if (product.untracked) return null;
  if (product.stock <= 0) return 'out';
  return product.lowStock ? 'low' : 'in_stock';
}

function Summary({ product }: { product: ProductDetail }) {
  const t = useTranslations('products.detail');
  const codes = [
    product.sku ? t('sku', { sku: product.sku }) : null,
    product.barcode ? t('barcode', { barcode: product.barcode }) : null,
  ].filter(Boolean);
  const stock = stockStatusOf(product);

  return (
    <View className="gap-4 rounded-xl bg-surface p-4">
      {product.images.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityLabel={t('pictures')}
          contentContainerClassName="gap-2">
          {product.images.map((image, index) => (
            <AppImage
              key={`${index}:${image.thumb}`}
              image={image}
              size="card"
              className="size-28 rounded-lg bg-surface-alt"
            />
          ))}
        </ScrollView>
      ) : null}
      <View className="gap-1">
        <Text variant="heading">{product.name}</Text>
        {codes.length > 0 ? <Text variant="meta">{codes.join(' · ')}</Text> : null}
        {product.vendorName ? (
          <Text variant="meta">{t('seller', { name: product.vendorName })}</Text>
        ) : null}
      </View>
      <View className="flex-row flex-wrap gap-2">
        <ProductStatusChip status={product.status} />
        {stock ? <StockStatusChip status={stock} /> : null}
      </View>
    </View>
  );
}

function Pricing({ product }: { product: ProductDetail }) {
  const t = useTranslations('products');

  return (
    <View>
      <RowGroup>
        <ValueRow
          label={t('detail.price')}
          value={product.price ? <Price money={product.price} /> : t('onRequest')}
          valueLabel={product.price?.formatted ?? t('onRequest')}
        />
        {product.priceOnRequest ? null : (
          <ValueRow
            label={t('detail.compareAt')}
            value={
              product.compareAtPrice ? (
                <Price money={product.compareAtPrice} className="font-normal" />
              ) : (
                t('detail.none')
              )
            }
            valueLabel={product.compareAtPrice?.formatted ?? t('detail.none')}
          />
        )}
      </RowGroup>
      {product.priceOnRequest ? <GroupFootnote text={t('detail.onRequestNote')} /> : null}
    </View>
  );
}

/** The one variant carrying a scanned code as its barcode or SKU, if one plainly does. */
function scannedVariant(product: ProductDetail, code: string | undefined) {
  const scanned = code?.trim().toLocaleLowerCase();
  if (!scanned) return undefined;
  const matches = product.variants.filter((variant) =>
    [variant.barcode, variant.sku].some((value) => value?.trim().toLocaleLowerCase() === scanned)
  );
  return matches.length === 1 ? matches[0]!.id : undefined;
}

function Variants({ product, code }: { product: ProductDetail; code?: string }) {
  const t = useTranslations('products');
  const stockWords = useStockWords();
  const scanned = scannedVariant(product, code);

  return (
    <View>
      <SectionLabel title={t('detail.variants')} />
      <RowGroup>
        {product.variants.map((variant) => {
          const stock = stockWords({
            stock: variant.stock,
            lowStock: false,
            untracked: product.untracked,
          });
          const price = variant.price?.formatted ?? t('onRequest');
          const match = variant.id === scanned ? t('detail.scannedMatch') : undefined;
          return (
            <ListRow
              key={variant.id}
              title={variant.name}
              subtitle={match}
              emphasis={Boolean(match)}
              className={match ? 'bg-info-soft' : undefined}
              titleEnd={
                variant.price ? (
                  <Price money={variant.price} />
                ) : (
                  <Text variant="meta">{t('onRequest')}</Text>
                )
              }
              meta={
                <Text variant="meta" numberOfLines={1}>
                  {variant.sku ? `${variant.sku} · ` : null}
                  <Text variant="meta" className={stock.className}>
                    {stock.text}
                  </Text>
                </Text>
              }
              metaEnd={
                variant.compareAtPrice ? (
                  <Price
                    money={variant.compareAtPrice}
                    className="font-normal text-muted line-through"
                  />
                ) : null
              }
              accessibilityLabel={[
                variant.name,
                match,
                price,
                variant.compareAtPrice
                  ? `${t('detail.compareAt')} ${variant.compareAtPrice.formatted}`
                  : null,
                variant.sku,
                stock.text,
              ]
                .filter(Boolean)
                .join(', ')}
            />
          );
        })}
      </RowGroup>
      {product.priceOnRequest ? <GroupFootnote text={t('detail.onRequestNote')} /> : null}
    </View>
  );
}

function Stock({ product }: { product: ProductDetail }) {
  const t = useTranslations('products.detail');

  return (
    <View>
      <SectionLabel title={t('stock')} />
      <RowGroup>
        {product.untracked ? (
          <ValueRow label={t('stock')} value={t('untracked')} />
        ) : product.locations.length === 0 ? (
          <ValueRow label={t('stock')} value={t('noLocations')} />
        ) : (
          product.locations.map((location) => (
            <ValueRow
              key={location.locationId}
              label={location.name}
              value={t('available', { count: location.available })}
            />
          ))
        )}
      </RowGroup>
    </View>
  );
}
