import { FlashList } from '@shopify/flash-list';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { FilterTabs } from '@/components/ui/filter-tabs';
import type { IconName } from '@/components/ui/icon';
import { IconCircle } from '@/components/ui/icon-circle';
import { GroupedItem, ListEnd } from '@/components/ui/list-group';
import { GroupFootnote, ListRow, SectionLabel } from '@/components/ui/rows';
import { Screen, StackHeader, useBottomSpace } from '@/components/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import type { StockMovement, StockMovementActor } from '@/contracts/mobile/biz/v1';
import { useDayLabel } from '@/i18n/use-list-time';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';
import { useRefetchOnFocus } from '@/lib/use-refetch-on-focus';

import {
  useProduct,
  useProductStock,
  useStockMovements,
  type StockMovementFilter,
} from './use-products';

/** The filter chip that narrows nothing. */
const ALL = 'all';

type HistoryRow =
  | { type: 'day'; key: string; at: string }
  | { type: 'movement'; key: string; movement: StockMovement; index: number; count: number };

/** The local calendar day a moment falls on. */
function dayOf(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/** The movements under a heading per day, each day's rows one group. They come newest first. */
function byDay(movements: readonly StockMovement[]): HistoryRow[] {
  const days: { key: string; at: string; movements: StockMovement[] }[] = [];
  for (const movement of movements) {
    const key = dayOf(movement.at);
    const last = days[days.length - 1];
    if (last?.key === key) last.movements.push(movement);
    else days.push({ key, at: movement.at, movements: [movement] });
  }
  return days.flatMap((day) => [
    { type: 'day' as const, key: `day:${day.key}`, at: day.at },
    ...day.movements.map((movement, index) => ({
      type: 'movement' as const,
      key: movement.id,
      movement,
      index,
      count: day.movements.length,
    })),
  ]);
}

/**
 * The locations and variants a product's history can be narrowed to: those of
 * its stock the operator may see (GET /products/{id}/stock). One location, or
 * none, is nothing to choose between.
 */
function useChoices(id: string) {
  const stock = useProductStock(id);
  return useMemo(() => {
    const rows = stock.data?.rows ?? [];
    const locations = new Map<string, string>();
    for (const row of rows) {
      for (const location of row.locations) locations.set(location.locationId, location.name);
    }
    return {
      locations: [...locations].map(([value, label]) => ({ value, label })),
      variants: rows.flatMap((row) =>
        row.variantId ? [{ value: row.variantId, label: row.name }] : []
      ),
    };
  }, [stock.data]);
}

/**
 * What moved a product's stock, as the store records
 * it: adjustments, transfers and returns put back on sale, newest first and
 * under a heading per day; narrowed to one location and, on a product with
 * variants, one variant. Each row says what happened, the units in or out,
 * where, who, when, and the count after it when the store recorded one. Sales
 * are not movements the store records: the footnote says so.
 */
export function StockHistoryScreen({ id }: { id: string }) {
  const t = useTranslations('products.history');
  const titles = useTranslations('shell.titles');
  const dayLabel = useDayLabel();
  const bottom = useBottomSpace();
  const product = useProduct(id);
  const choices = useChoices(id);
  const [locationId, setLocationId] = useState(ALL);
  const [variantId, setVariantId] = useState(ALL);
  const filter: StockMovementFilter = {
    ...(locationId !== ALL ? { locationId } : {}),
    ...(variantId !== ALL ? { variantId } : {}),
  };
  const filtered = locationId !== ALL || variantId !== ALL;
  const list = useStockMovements(id, filter);
  const { refetch } = list;
  useRefetchOnFocus(refetch);
  const pull = usePullToRefresh(refetch);
  const items = list.data;
  const rows = useMemo(() => byDay(items ?? []), [items]);

  const top = (
    <View className="gap-4 pt-2 pb-2">
      <View className="gap-1 px-8">
        {product.data ? <Text variant="heading">{product.data.name}</Text> : null}
        <Text variant="meta">{t('lead')}</Text>
      </View>
      {choices.locations.length > 1 ? (
        <FilterTabs
          label={t('filters.location')}
          value={locationId}
          onChange={setLocationId}
          tabs={[{ value: ALL, label: t('filters.allLocations') }, ...choices.locations]}
        />
      ) : null}
      {choices.variants.length > 0 ? (
        <FilterTabs
          label={t('filters.variant')}
          value={variantId}
          onChange={setVariantId}
          tabs={[{ value: ALL, label: t('filters.allVariants') }, ...choices.variants]}
        />
      ) : null}
    </View>
  );

  return (
    <Screen header={<StackHeader title={titles('stockHistory')} />}>
      <FlashList
        testID="stock-history"
        data={list.isPending ? [] : rows}
        extraData={rows.length}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.type}
        renderItem={({ item }) =>
          item.type === 'day' ? (
            <View className="px-4 pt-4">
              <SectionLabel title={dayLabel(item.at)} />
            </View>
          ) : (
            <View className="px-4">
              <GroupedItem index={item.index} count={item.count} divider="leading">
                <MovementRow movement={item.movement} />
              </GroupedItem>
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom: bottom }}
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError) {
            void list.fetchNextPage();
          }
        }}
        ListHeaderComponent={top}
        ListEmptyComponent={
          list.isPending ? (
            <LoadingState shape="rows" />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          ) : (
            <EmptyState
              icon="clock"
              placement="top"
              title={filtered ? t('emptyFiltered.title') : t('empty.title')}
              body={filtered ? t('emptyFiltered.body') : t('empty.body')}
            />
          )
        }
        ListFooterComponent={
          <View className="px-4">
            <ListEnd
              leading
              loading={list.isFetchingNextPage}
              error={
                (list.isFetchNextPageError || list.isRefetchError) && rows.length > 0
                  ? list.error
                  : null
              }
              onRetry={() =>
                void (list.isFetchNextPageError ? list.fetchNextPage() : list.refetch())
              }
            />
            {rows.length > 0 && !list.hasNextPage ? (
              <GroupFootnote text={t('footnote')} className="pt-4" />
            ) : null}
          </View>
        }
      />
    </Screen>
  );
}

/** The icon of a movement: what moved it, and which way. */
function iconOf(movement: StockMovement): IconName {
  switch (movement.kind) {
    case 'transfer_shipped':
      return 'truck';
    case 'transfer_received':
      return 'package';
    case 'transfer_cancelled':
      return 'x-circle';
    case 'return_restocked':
      return 'return';
    case 'adjustment':
      if (movement.set) return 'pencil';
      return movement.change < 0 ? 'minus' : 'plus';
    default:
      return 'boxes';
  }
}

/** What happened, in the operator's words: an adjustment by its reason. */
function useMovementTitle(): (movement: StockMovement) => string {
  const t = useTranslations('products.history');
  const reasons = useTranslations('products.adjust.reasons');

  return (movement) => {
    switch (movement.kind) {
      case 'adjustment':
        if (movement.reason) return reasons(movement.reason);
        return movement.set ? t('kinds.set') : t('kinds.adjustment');
      case 'transfer_shipped':
      case 'transfer_received':
      case 'transfer_cancelled':
      case 'return_restocked':
        return t(`kinds.${movement.kind}`);
      default:
        // A kind newer than this app: the change says the rest.
        return t('kinds.other');
    }
  };
}

/** Who moved the units: a person and their role, the marketplace's team, or nobody recorded. */
function useActorLabel(): (actor: StockMovementActor) => string {
  const t = useTranslations('products.history');
  const roles = useTranslations('workspace.role');
  const common = useTranslations('common');

  return (actor) => {
    if (actor.kind === 'person') {
      const name = actor.name ?? t('actor.someone');
      return actor.role ? [name, roles(actor.role)].join(common('separator')) : name;
    }
    return actor.kind === 'store' ? t('actor.store') : t('actor.system');
  };
}

/**
 * One movement: what happened and the units in or out (in `success` when
 * units came in; out is no fault, so it keeps the text's colour); where, with
 * the count after it under the units; then the time, who and what it belongs
 * to; and the note.
 */
function MovementRow({ movement }: { movement: StockMovement }) {
  const t = useTranslations('products.history');
  const common = useTranslations('common');
  const format = useFormatter();
  const titleOf = useMovementTitle();
  const actorOf = useActorLabel();
  const separator = common('separator');

  const inward = movement.change >= 0;
  const units = Math.abs(movement.change);
  const change = inward ? t('unitsIn', { count: units }) : t('unitsOut', { count: units });
  const spokenChange = inward
    ? t('unitsInSpoken', { count: units })
    : t('unitsOutSpoken', { count: units });
  const place = movement.locationId
    ? (movement.locationName ?? t('unknownLocation'))
    : t('noLocation');
  const where = [movement.variantName, place].filter(Boolean).join(separator);
  const time = format.dateTime(new Date(movement.at), { hour: 'numeric', minute: '2-digit' });
  const reference = movement.reference
    ? t(`reference.${movement.reference.kind}`, { number: movement.reference.number })
    : undefined;
  const who = [time, actorOf(movement.actor), reference].filter(Boolean).join(separator);
  const after =
    movement.quantityAfter !== undefined
      ? t('after', { count: movement.quantityAfter })
      : undefined;
  const note = movement.note ? t('note', { note: movement.note }) : undefined;
  const title = titleOf(movement);

  return (
    <ListRow
      leading={
        <IconCircle icon={iconOf(movement)} tone={inward ? 'success' : 'neutral'} size="md" />
      }
      title={title}
      titleEnd={
        <Text variant="price" className={inward ? 'text-success' : undefined}>
          {change}
        </Text>
      }
      meta={
        <View className="gap-0.5">
          {/* Where, with the count after it at the end: under the units it moved. */}
          <View className="flex-row items-center gap-3">
            <Text numberOfLines={1} className="flex-1">
              {where}
            </Text>
            {after ? <Text variant="meta">{after}</Text> : null}
          </View>
          <Text variant="meta" numberOfLines={2}>
            {who}
          </Text>
          {note ? (
            <Text variant="meta" numberOfLines={3} className="text-foreground">
              {note}
            </Text>
          ) : null}
        </View>
      }
      accessibilityLabel={[title, spokenChange, where, after, who, note]
        .filter(Boolean)
        .join(common('listSeparator'))}
    />
  );
}
