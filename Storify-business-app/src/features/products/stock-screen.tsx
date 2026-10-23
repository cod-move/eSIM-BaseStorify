import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { GroupFootnote, RowGroup, SectionLabel } from '@/components/ui/rows';
import { Screen, StackHeader } from '@/components/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import type { StockLocation, StockRow } from '@/contracts/mobile/biz/v1';
import { useCan } from '@/features/workspace/use-workspace';
import { cn } from '@/lib/cn';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';
import { useRefetchOnFocus } from '@/lib/use-refetch-on-focus';

import { StockAdjustSheet, type AdjustTarget } from './stock-adjust-sheet';
import { useProduct, useProductStock } from './use-products';

/**
 * A product's stock, the product's own or one row per
 * variant: available, committed, unavailable and on hand as a 2 × 2 of
 * figures, then the units available at each location the operator may see,
 * with Add and Remove (`ADJUST_STOCK`). A figure changes only from the store's
 * answer.
 *
 * The store sends the four figures per row and the available units per
 * location (`StockRow.locations`), so the locations show available units.
 * The clock in the header opens what moved the stock (stock-history-screen.tsx).
 */
export function StockScreen({ id }: { id: string }) {
  const t = useTranslations('products.stock');
  const titles = useTranslations('shell.titles');
  const product = useProduct(id);
  const stock = useProductStock(id);
  const canAdjust = useCan('ADJUST_STOCK');
  const [target, setTarget] = useState<AdjustTarget | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const { refetch } = stock;
  useRefetchOnFocus(refetch);
  const { refreshing, onRefresh } = usePullToRefresh(refetch);

  const header = (
    <StackHeader
      title={titles('stock')}
      actions={
        <IconButton
          icon="clock"
          label={t('history')}
          onPress={() => router.push({ pathname: '/products/[id]/stock-history', params: { id } })}
        />
      }
    />
  );
  const data = stock.data;
  if (!data) {
    return (
      <Screen header={header}>
        {stock.isError ? (
          <ErrorState error={stock.error} onRetry={() => void refetch()} />
        ) : (
          <LoadingState shape="rows" />
        )}
      </Screen>
    );
  }

  if (data.untracked) {
    return (
      <Screen header={header}>
        <EmptyState icon="boxes" title={t('untracked')} body={t('untrackedBody')} />
      </Screen>
    );
  }

  const open = (next: AdjustTarget) => {
    setTarget(next);
    setAdjusting(true);
  };
  const withVariants = data.rows.some((row) => row.variantId !== undefined);

  return (
    <Screen
      header={header}
      scroll
      refreshing={refreshing}
      onRefresh={onRefresh}
      contentClassName="gap-6 px-4 pt-2">
      <View className="gap-1 px-4">
        {product.data ? <Text variant="heading">{product.data.name}</Text> : null}
        <Text variant="meta">{t('lowAt', { count: data.lowStockThreshold })}</Text>
      </View>

      {data.rows.map((row) => (
        <View key={row.variantId ?? 'product'}>
          {withVariants ? (
            <SectionLabel title={row.sku ? `${row.name} · ${row.sku}` : row.name} />
          ) : null}
          <RowGroup>
            <Figures row={row} threshold={data.lowStockThreshold} />
            {row.locations.length === 0 ? (
              <Text className="px-4 py-3 text-muted">{t('noLocations')}</Text>
            ) : (
              row.locations.map((location) => (
                <LocationRow
                  key={location.locationId}
                  location={location}
                  onAdjust={
                    canAdjust
                      ? (direction) =>
                          open({
                            direction,
                            location,
                            variantId: row.variantId,
                            variantName: row.variantId ? row.name : undefined,
                          })
                      : undefined
                  }
                />
              ))
            )}
          </RowGroup>
        </View>
      ))}

      <GroupFootnote text={t('explained')} />

      {canAdjust ? (
        <StockAdjustSheet
          productId={id}
          target={target}
          visible={adjusting}
          onClose={() => setAdjusting(false)}
        />
      ) : null}
    </Screen>
  );
}

/** Available, committed, unavailable and on hand, two by two. Available takes a tone when low or out. */
function Figures({ row, threshold }: { row: StockRow; threshold: number }) {
  const t = useTranslations('products.stock');
  const format = useFormatter();
  const figures = [
    { label: t('available'), value: row.available },
    { label: t('committed'), value: row.committed },
    { label: t('unavailable'), value: row.unavailable },
    { label: t('onHand'), value: row.onHand },
  ];
  const availableTone =
    row.available <= 0 ? 'text-danger' : row.available <= threshold ? 'text-warning' : undefined;

  return (
    <View
      accessible
      accessibilityLabel={figures
        .map((figure) => `${figure.label} ${format.number(figure.value)}`)
        .join(', ')}
      className="flex-row flex-wrap px-4 py-2">
      {figures.map((figure, index) => (
        <View key={figure.label} className="w-1/2 gap-0.5 py-2">
          <Text variant="meta">{figure.label}</Text>
          <Text variant="price-large" className={cn(index === 0 && availableTone)}>
            {format.number(figure.value)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function LocationRow({
  location,
  onAdjust,
}: {
  location: StockLocation;
  onAdjust?: (direction: 'add' | 'remove') => void;
}) {
  const t = useTranslations('products');
  const available = t('detail.available', { count: location.available });

  return (
    <View className="gap-3 px-4 py-3">
      <View
        accessible
        accessibilityLabel={`${location.name}, ${available}`}
        className="flex-row items-center gap-3">
        <Text variant="subheading" className="flex-1">
          {location.name}
        </Text>
        <Text className="text-muted">{available}</Text>
      </View>
      {onAdjust ? (
        <View className="flex-row justify-end gap-2">
          <Button
            label={t('stock.remove')}
            accessibilityLabel={t('stock.removeAt', { location: location.name })}
            icon="minus"
            variant="secondary"
            size="sm"
            onPress={() => onAdjust('remove')}
          />
          <Button
            label={t('stock.add')}
            accessibilityLabel={t('stock.addAt', { location: location.name })}
            icon="plus"
            variant="secondary"
            size="sm"
            onPress={() => onAdjust('add')}
          />
        </View>
      ) : null}
    </View>
  );
}
