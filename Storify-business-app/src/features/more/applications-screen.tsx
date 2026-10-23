import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { LogoTile } from '@/components/ui/avatar';
import { FilterTabs } from '@/components/ui/filter-tabs';
import { GroupedItem, ListEnd } from '@/components/ui/list-group';
import { ListRow } from '@/components/ui/rows';
import { Screen, StackHeader, useBottomSpace } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import {
  VENDOR_APPLICATION_TABS,
  VendorApplicationListQuery,
  type VendorApplicationListItem,
} from '@/contracts/mobile/biz/v1';
import { ApplicationStatusChip, useStatusLabel } from '@/features/status/status-chip';
import { useShortDate } from '@/i18n/use-list-time';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';
import { useRefetchOnFocus } from '@/lib/use-refetch-on-focus';

import { useVendorApplications } from './use-vendor-applications';

type Tab = (typeof VENDOR_APPLICATION_TABS)[number];

/** The longest search the store takes (the contract's). */
const SEARCH_MAX = VendorApplicationListQuery.shape.search.unwrap().maxLength;

/**
 * Sellers' applications, for administrators:
 * those waiting for a decision first, the one waiting longest at the top; the
 * decided ones on their own tabs; a search by the shop's name.
 */
export function ApplicationsScreen() {
  const t = useTranslations('applications');
  const titles = useTranslations('shell.titles');
  const bottom = useBottomSpace();
  const [tab, setTab] = useState<Tab>('pending');
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim());
  const list = useVendorApplications({
    tab,
    ...(term ? { search: SEARCH_MAX ? term.slice(0, SEARCH_MAX) : term } : {}),
  });
  useRefetchOnFocus(list.refetch);
  const pull = usePullToRefresh(list.refetch);
  const items = list.data ?? [];

  const empty = term
    ? { title: t('emptySearch.title'), body: t('emptySearch.body', { search: term }) }
    : { title: t(`empty.${tab}.title`), body: t(`empty.${tab}.body`) };

  const content = () => {
    if (list.isPending) return <LoadingState shape="rows" leading />;
    if (list.isError && !list.data) {
      return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
    }
    return (
      <FlashList
        data={items}
        extraData={items.length}
        keyExtractor={(application) => application.id}
        renderItem={({ item, index }) => (
          <GroupedItem index={index} count={items.length} divider="leading">
            <ApplicationRow
              application={item}
              onPress={() =>
                router.push({ pathname: '/applications/[id]', params: { id: item.id } })
              }
            />
          </GroupedItem>
        )}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottom }}
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError) {
            void list.fetchNextPage();
          }
        }}
        ListEmptyComponent={
          <EmptyState icon="file-text" placement="top" title={empty.title} body={empty.body} />
        }
        ListFooterComponent={
          <ListEnd
            leading
            loading={list.isFetchingNextPage}
            error={list.isFetchNextPageError || list.isRefetchError ? list.error : null}
            onRetry={() => void (list.isFetchNextPageError ? list.fetchNextPage() : list.refetch())}
          />
        }
      />
    );
  };

  return (
    <Screen header={<StackHeader title={titles('applications')} icon="file-text" />}>
      <View className="gap-3 pb-3">
        <View className="px-4">
          <SearchField label={t('search')} value={search} onChangeText={setSearch} />
        </View>
        <FilterTabs
          label={t('tabs.label')}
          value={tab}
          onChange={setTab}
          tabs={VENDOR_APPLICATION_TABS.map((value) => ({ value, label: t(`tabs.${value}`) }))}
        />
      </View>
      {content()}
    </Screen>
  );
}

/** One application: the shop, who applied, when, the plan, and where it stands. */
function ApplicationRow({
  application,
  onPress,
}: {
  application: VendorApplicationListItem;
  onPress: () => void;
}) {
  const t = useTranslations('applications');
  const common = useTranslations('common');
  const date = useShortDate();
  const statusLabel = useStatusLabel();
  const meta = [
    application.submittedAt ? t('applied', { date: date(application.submittedAt) }) : null,
    application.planName,
  ]
    .filter(Boolean)
    .join(common('separator'));

  return (
    <ListRow
      leading={<LogoTile logo={application.logo} size="md" />}
      title={application.storeName}
      subtitle={application.applicantName}
      meta={meta || undefined}
      metaEnd={<ApplicationStatusChip status={application.status} />}
      chevron
      accessibilityLabel={[
        application.storeName,
        application.applicantName,
        statusLabel('application', application.status),
        meta,
      ]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
    />
  );
}
