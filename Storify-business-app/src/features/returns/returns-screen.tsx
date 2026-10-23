import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { ListRow, NavRow, RowGroup, ValueRow } from '@/components/ui/rows';
import { Screen, StackHeader } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { EmptyState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { AppImage } from '@/components/ui/app-image';
import type { ReturnListQuery } from '@/contracts/mobile/biz/v1';
import { useCan } from '@/features/workspace/use-workspace';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useRefetchOnFocus } from '@/lib/use-refetch-on-focus';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';
import { useReturn, useReturns } from './use-returns';
import { ReturnAttachment, ReturnBreakdown, ReturnUnavailable, useReturnWord } from './shared';

/** A refund destination's fields, in the order they are read. */
const DESTINATION_FIELDS = ['method', 'accountName', 'accountNumber', 'provider'] as const;

export function ReturnsScreen() {
  const t = useTranslations('returns');
  const { orderId, tab: initialTab } = useLocalSearchParams<{ orderId?: string; tab?: string }>();
  const [tab, setTab] = useState<NonNullable<ReturnListQuery['tab']>>(() =>
    ['actionable', 'pending', 'completed', 'all', 'open'].includes(initialTab ?? '')
      ? (initialTab as NonNullable<ReturnListQuery['tab']>)
      : 'actionable'
  );
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim());
  const list = useReturns({ tab, search: term || undefined, orderId });
  const word = useReturnWord();
  useRefetchOnFocus(list.refetch);
  const { refreshing, onRefresh } = usePullToRefresh(list.refetch);
  // Nothing read yet but more to come: `useReturns` reads on until a row or the end.
  const searching = !list.data?.length && list.hasNextPage;
  return (
    <Screen
      header={<StackHeader title={t('title')} icon="return" />}
      scroll
      refreshing={refreshing}
      onRefresh={onRefresh}
      contentClassName="gap-4 px-4">
      <FilterTabs
        label={t('filterLabel')}
        value={tab}
        onChange={setTab}
        tabs={(['open', 'actionable', 'pending', 'completed', 'all'] as const).map((value) => ({
          value,
          label: t(`tabs.${value}`),
        }))}
      />
      <SearchField label={t('search')} value={search} maxLength={100} onChangeText={setSearch} />
      {list.isPending ? (
        <LoadingState shape="rows" />
      ) : !list.data && list.isError ? (
        <ReturnUnavailable error={list.error} retry={() => void list.refetch()} />
      ) : (
        <>
          {searching ? (
            list.isError ? null : (
              <LoadingState shape="rows" />
            )
          ) : !list.data?.length ? (
            <EmptyState icon="return" title={t('empty')} body={t('emptyBody')} />
          ) : null}
          <RowGroup>
            {list.data?.map((row) => (
              <ListRow
                key={row.id}
                title={t('caseTitle', { number: row.number })}
                accessibilityLabel={t('caseTitle', { number: row.number })}
                subtitle={[
                  row.orderNumber,
                  row.customerName,
                  row.vendorName,
                  word('status', row.status),
                  word('settlement', row.refundStatus),
                  row.estimatedRefund?.formatted,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onPress={() => router.push({ pathname: '/returns/[id]', params: { id: row.id } })}
              />
            ))}
          </RowGroup>
          {list.isError ? (
            <ReturnUnavailable error={list.error} retry={() => void list.refetch()} />
          ) : null}
          {list.hasNextPage && (!searching || list.isError) ? (
            <Button
              label={t('loadMore')}
              loading={list.isFetchingNextPage}
              onPress={() => void list.fetchNextPage()}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}
export function ReturnDetailScreen({ id }: { id: string }) {
  const t = useTranslations('returns');
  const word = useReturnWord();
  const query = useReturn(id);
  useRefetchOnFocus(query.refetch);
  const canHandle = useCan('HANDLE_RETURNS');
  const canRefund = useCan('ISSUE_REFUNDS');
  const canOrders = useCan('VIEW_ORDERS');
  const { refreshing, onRefresh } = usePullToRefresh(query.refetch);
  const row = query.data;
  const header = <StackHeader title={row ? t('caseTitle', { number: row.number }) : t('title')} />;
  if (!row)
    return (
      <Screen header={header}>
        {query.isPending ? (
          <LoadingState shape="rows" />
        ) : (
          <ReturnUnavailable error={query.error} retry={() => void query.refetch()} />
        )}
      </Screen>
    );
  return (
    <Screen
      header={header}
      scroll
      refreshing={refreshing}
      onRefresh={onRefresh}
      contentClassName="gap-4 px-4">
      <RowGroup>
        <ValueRow label={t('statusLabel')} value={word('status', row.status)} />
        <ValueRow label={t('refundState')} value={word('settlement', row.refundStatus)} />
        <ValueRow label={t('reason')} value={row.reason} />
        <ValueRow label={t('refunded')} value={row.refunded.formatted} />
        {canOrders ? (
          <NavRow
            icon="package"
            title={t('order', { number: row.orderNumber })}
            onPress={() => router.push({ pathname: '/orders/[id]', params: { id: row.orderId } })}
          />
        ) : null}
      </RowGroup>
      {row.items.map((item) => (
        <View key={item.orderItemIndex} className="gap-2 rounded-xl bg-surface p-3">
          <View className="flex-row items-center gap-3">
            <AppImage image={item.image} size="thumb" className="size-12 rounded-md" />
            <Text variant="label" className="flex-1">
              {item.name}
            </Text>
          </View>
          <RowGroup>
            {(
              [
                'quantityRequested',
                'quantityApproved',
                'quantityReceived',
                'quantityRestocked',
                'quantityHeld',
                'quantityWrittenOff',
              ] as const
            ).map((key) =>
              item[key] !== undefined ? (
                <ValueRow key={key} label={t(`counts.${key}`)} value={String(item[key])} />
              ) : null
            )}
            {item.condition ? (
              <ValueRow label={t('condition')} value={word('conditions', item.condition)} />
            ) : null}
          </RowGroup>
        </View>
      ))}
      <Text variant="section">{t('estimate')}</Text>
      <ReturnBreakdown value={row.estimate} />
      {[row.customerNote, row.adminNote, row.vendorNote, row.rejectionReason]
        .filter(Boolean)
        .map((note, index) => (
          <Text key={index}>{note}</Text>
        ))}
      {row.destination ? (
        <RowGroup>
          {DESTINATION_FIELDS.map((field) => {
            const value = row.destination?.[field];
            return value ? (
              <ValueRow
                key={field}
                label={t(`destination.${field}`)}
                value={field === 'method' ? word('destinationMethods', value) : value}
              />
            ) : null;
          })}
        </RowGroup>
      ) : null}
      {row.returnTo ? (
        <>
          <Text variant="section">{t('returnTo')}</Text>
          <Text>{row.returnTo.name}</Text>
          <Text>{row.returnTo.address}</Text>
        </>
      ) : null}
      {row.shipment ? (
        <>
          <Text variant="section">{t('shipment')}</Text>
          {row.shipment.carrier ? <Text>{row.shipment.carrier}</Text> : null}
          {row.shipment.trackingNumber ? <Text>{row.shipment.trackingNumber}</Text> : null}
          {row.shipment.labelAvailable ? <ReturnAttachment id={id} label={t('openLabel')} /> : null}
        </>
      ) : null}
      {row.evidence.map((file) => (
        <ReturnAttachment
          key={file.id}
          id={id}
          uploadId={file.id}
          label={t('openEvidence', { name: file.filename })}
        />
      ))}
      {row.settlement?.method || row.settlement?.reference ? (
        <>
          <Text variant="section">{t('settlementDetails')}</Text>
          <RowGroup>
            {row.settlement.method ? (
              <ValueRow
                label={t('settlementMethod')}
                value={word('destinationMethods', row.settlement.method)}
              />
            ) : null}
            {row.settlement.reference ? (
              <ValueRow label={t('settlementReference')} value={row.settlement.reference} />
            ) : null}
          </RowGroup>
        </>
      ) : null}
      {canHandle ? (
        <RowGroup>
          {row.actions.map((action) => (
            <NavRow
              key={action}
              icon="return"
              title={t(`actions.${action}`)}
              onPress={() =>
                router.push({ pathname: '/returns/[id]/action', params: { id, action } })
              }
            />
          ))}
        </RowGroup>
      ) : null}
      {canRefund && row.canPreviewRefund ? (
        <Button
          label={t('reviewRefund')}
          onPress={() =>
            router.push({ pathname: '/refunds/new', params: { kind: 'return', targetId: id } })
          }
        />
      ) : null}
      <Text variant="section">{t('timeline')}</Text>
      {row.timeline.map((event, index) => (
        <Text key={index}>{event.message}</Text>
      ))}
      {query.isError ? (
        <ReturnUnavailable error={query.error} retry={() => void query.refetch()} />
      ) : null}
    </Screen>
  );
}
