import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Banner } from '@/components/ui/banner';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { ChoiceChips } from '@/components/ui/form-sections';
import { GroupedItem, ListEnd } from '@/components/ui/list-group';
import { Price } from '@/components/ui/price';
import { ListRow, RowGroup, SectionLabel } from '@/components/ui/rows';
import { Screen, StackHeader, useBottomSpace } from '@/components/ui/screen';
import { SelectField } from '@/components/ui/select-field';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, InlineError, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { FieldSurfaceProvider } from '@/components/ui/text-field';
import {
  PAYOUT_STATUSES,
  type PayoutListItem,
  type PayoutSummary,
} from '@/contracts/mobile/biz/v1';
import { PayoutStatusChip, useStatusLabel } from '@/features/status/status-chip';
import { useShortDate } from '@/i18n/use-list-time';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';
import { useRefetchOnFocus } from '@/lib/use-refetch-on-focus';

import { usePayoutCurrency, usePayouts, usePayoutSummary } from './use-payouts';

const FILTERS = ['all', ...PAYOUT_STATUSES] as const;
type Filter = (typeof FILTERS)[number];

/** Up to this many currencies are chips; more are a field that opens a list. */
const CURRENCY_CHIPS_UP_TO = 4;

/** "7 Sep – 21 Sep", "Paid 1 Oct": the period of a payout, and when it was paid. */
function usePayoutWhen(): (payout: PayoutListItem) => { period: string; paid: string | null } {
  const t = useTranslations('payouts');
  const time = useTranslations('time');
  const date = useShortDate();

  return (payout) => ({
    period: time('range', { start: date(payout.periodStart), end: date(payout.periodEnd) }),
    paid: payout.paidAt ? t('paid', { date: date(payout.paidAt) }) : null,
  });
}

/**
 * A seller's money: what is ready to pay and what is
 * kept back (the return window, the reserve, what they owe the store), in the
 * currency chosen when the store offers more than one; then the payouts the
 * store has made, newest first, by status, each in its own currency. Read only.
 */
export function PayoutsScreen() {
  const t = useTranslations('payouts');
  const titles = useTranslations('shell.titles');
  const statusLabel = useStatusLabel();
  const bottom = useBottomSpace();
  const [filter, setFilter] = useState<Filter>('all');
  const summary = usePayoutSummary();
  const currency = usePayoutCurrency(summary.data);
  const list = usePayouts(filter === 'all' ? {} : { status: filter });
  const { refetch: refetchSummary } = summary;
  const { refetch: refetchList } = list;
  const refetch = useCallback(
    () => Promise.all([refetchSummary(), refetchList()]),
    [refetchSummary, refetchList]
  );
  useRefetchOnFocus(refetch);
  const pull = usePullToRefresh(refetch);
  const items = list.data ?? [];
  const header = <StackHeader title={titles('payouts')} icon="wallet" />;

  if (summary.isPending && list.isPending) {
    return (
      <Screen header={header}>
        <LoadingState shape="rows" />
      </Screen>
    );
  }
  if (summary.isError && !summary.data && list.isError && !list.data) {
    return (
      <Screen header={header}>
        <ErrorState error={summary.error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  const top = (
    <View className="gap-6 pt-2 pb-3">
      <Balance
        summary={summary.data}
        error={summary.data ? null : summary.error}
        onRetry={() => void summary.refetch()}
        currencyChoice={
          currency.offered.length > 1 ? (
            <CurrencyChoice
              offered={currency.offered}
              value={currency.value}
              onChange={currency.choose}
            />
          ) : null
        }
      />
      <View className="gap-3">
        <SectionLabel title={t('list')} className="px-8 pb-0" />
        <FilterTabs
          label={t('filters.label')}
          value={filter}
          onChange={setFilter}
          tabs={FILTERS.map((value) => ({
            value,
            label: value === 'all' ? t('filters.all') : statusLabel('payout', value),
          }))}
        />
      </View>
    </View>
  );

  return (
    <Screen header={header}>
      <FlashList
        testID="payout-list"
        data={list.isPending ? [] : items}
        extraData={items.length}
        keyExtractor={(payout) => payout.id}
        renderItem={({ item, index }) => (
          <View className="px-4">
            <GroupedItem index={index} count={items.length}>
              <PayoutRow
                payout={item}
                onPress={() => router.push({ pathname: '/payouts/[id]', params: { id: item.id } })}
              />
            </GroupedItem>
          </View>
        )}
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
              icon="wallet"
              placement="top"
              title={filter === 'all' ? t('empty.title') : t('emptyFiltered.title')}
              body={filter === 'all' ? t('empty.body') : t('emptyFiltered.body')}
            />
          )
        }
        ListFooterComponent={
          <View className="px-4">
            <ListEnd
              loading={list.isFetchingNextPage}
              error={
                (list.isFetchNextPageError || list.isRefetchError) && items.length > 0
                  ? list.error
                  : null
              }
              onRetry={() =>
                void (list.isFetchNextPageError ? list.fetchNextPage() : list.refetch())
              }
            />
          </View>
        }
      />
    </Screen>
  );
}

/**
 * The balance card: the choice of currency, when there is one, and what is
 * ready to pay; under it what is kept back and why. While a currency is read
 * its figures are skeletons; when they cannot be read they are unavailable,
 * with why and "Try again": never a zero, never another currency's.
 */
function Balance({
  summary,
  error,
  onRetry,
  currencyChoice,
}: {
  summary: PayoutSummary | undefined;
  error: unknown;
  onRetry: () => void;
  currencyChoice: ReactNode;
}) {
  const t = useTranslations('payouts');
  const common = useTranslations('common');
  const unavailable = error ? [t('readyToPay'), t('unavailable')].join(', ') : common('loading');

  return (
    <View className="gap-4 px-4">
      <View className="gap-4 rounded-xl bg-surface p-4">
        {currencyChoice}
        {summary ? (
          <ReadyToPay summary={summary} />
        ) : (
          <View
            accessible
            accessibilityRole={error ? undefined : 'progressbar'}
            accessibilityLabel={unavailable}
            className="gap-1">
            <Text variant="meta">{t('readyToPay')}</Text>
            {error ? (
              <Text variant="title" className="text-muted">
                {t('unavailable')}
              </Text>
            ) : (
              <>
                <Skeleton className="my-1 h-8 w-40" />
                <Skeleton className="h-3.5 w-24" />
              </>
            )}
          </View>
        )}
      </View>
      {summary ? <ReadyCaveats summary={summary} /> : null}
      {summary ? (
        <KeptBack summary={summary} />
      ) : error ? (
        <InlineError error={error} onRetry={onRetry} />
      ) : (
        <SkeletonRows rows={4} />
      )}
    </View>
  );
}

/** The currencies the store offers the balance in: a few as chips, more as a list. */
function CurrencyChoice({
  offered,
  value,
  onChange,
}: {
  offered: readonly string[];
  value: string | undefined;
  onChange: (currency: string) => void;
}) {
  const t = useTranslations('payouts');
  // A code is the store's word for its currency, the same in every language.
  const choices = offered.map((code) => ({ value: code, label: code }));

  if (offered.length <= CURRENCY_CHIPS_UP_TO) {
    return (
      <ChoiceChips label={t('currency')} value={value} choices={choices} onChange={onChange} />
    );
  }
  return (
    <FieldSurfaceProvider value="surface">
      <SelectField
        label={t('currency')}
        value={value ?? ''}
        choices={choices}
        onChange={onChange}
      />
    </FieldSurfaceProvider>
  );
}

/** What a payout made now would pay, and for how many orders. */
function ReadyToPay({ summary }: { summary: PayoutSummary }) {
  const t = useTranslations('payouts');
  const ready = t('readyFor', { count: summary.orderCount });

  return (
    <View
      accessible
      accessibilityLabel={[t('readyToPay'), summary.readyToPay.formatted, ready].join(', ')}
      className="gap-1">
      <Text variant="meta">{t('readyToPay')}</Text>
      <Price money={summary.readyToPay} variant="price-large" />
      <Text variant="meta">{ready}</Text>
    </View>
  );
}

/**
 * What the store says of the figure: it cannot be paid out now (`eligible:
 * false`), or it counts only some of the orders (`hasMore`).
 */
function ReadyCaveats({ summary }: { summary: PayoutSummary }) {
  const t = useTranslations('payouts');
  const notes = [
    summary.eligible === false ? t('notPayable') : null,
    summary.hasMore ? t('partial') : null,
  ].filter((note): note is string => note !== null);

  return notes.map((note) => <Banner key={note} tone="warning" message={note} />);
}

/** What is kept back and why: the return window, the reserve, what is owed, the smallest payout. */
function KeptBack({ summary }: { summary: PayoutSummary }) {
  const t = useTranslations('payouts');
  const date = useShortDate();
  const { heldInReturnWindow: held, reserveHeld: reserve } = summary;
  const rows = [
    {
      key: 'held',
      title: t('held.title'),
      money: held.amount,
      meta: t('held.body', { count: held.orderCount, days: held.windowDays }),
    },
    {
      key: 'reserve',
      title: t('reserve.title'),
      money: reserve.amount,
      meta: reserve.releaseAt
        ? t('reserve.release', { date: date(reserve.releaseAt) })
        : t('reserve.body'),
    },
    {
      key: 'owed',
      title: t('owed.title'),
      money: summary.owedToPlatform,
      meta: t('owed.body'),
    },
    {
      key: 'minimum',
      title: t('minimum.title'),
      money: summary.minimumPayout,
      meta: t('minimum.body'),
    },
  ];

  return (
    <RowGroup>
      {rows.map((row) => (
        <ListRow
          key={row.key}
          title={row.title}
          titleEnd={<Price money={row.money} />}
          // What it is and when it comes runs long (a date at the end): two lines.
          meta={
            <Text variant="meta" numberOfLines={2}>
              {row.meta}
            </Text>
          }
          accessibilityLabel={[row.title, row.money.formatted, row.meta].join(', ')}
        />
      ))}
    </RowGroup>
  );
}

/** One payout: its number, what the seller receives, the period and its status. */
function PayoutRow({ payout, onPress }: { payout: PayoutListItem; onPress: () => void }) {
  const common = useTranslations('common');
  const when = usePayoutWhen();
  const statusLabel = useStatusLabel();
  const { period, paid } = when(payout);
  const meta = paid ? [period, paid].join(common('separator')) : period;

  return (
    <ListRow
      title={payout.number}
      titleEnd={<Price money={payout.net} />}
      meta={meta}
      metaEnd={<PayoutStatusChip status={payout.status} />}
      chevron
      accessibilityLabel={[
        payout.number,
        payout.net.formatted,
        statusLabel('payout', payout.status),
        meta,
      ].join(', ')}
      onPress={onPress}
    />
  );
}
