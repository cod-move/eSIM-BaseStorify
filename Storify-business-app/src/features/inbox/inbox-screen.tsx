import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { TextLink } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { ListEnd } from '@/components/ui/list-group';
import { RemovableChips } from '@/components/ui/removable-chips';
import { Screen, TabHeader, useBottomSpace } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import {
  CONVERSATION_ASSIGNEE_FILTERS,
  CONVERSATION_STATUSES,
  ConversationListQuery,
} from '@/contracts/mobile/biz/v1';
import { useCustomer } from '@/features/customers/use-customers';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';

import { ConversationRow } from './conversation-row';
import { InboxFilterSheet, NO_FILTER, filterCount, type InboxFilter } from './inbox-filter-sheet';
import { useConversations, type ConversationFilter } from './use-inbox';

/** The longest search the store takes (the contract's). */
const SEARCH_MAX = ConversationListQuery.shape.search.unwrap().maxLength;

/**
 * What the Inbox tab is opened with: its filters, its search, and one
 * customer's conversations (`customerId`, their id from GET /customers: a
 * customer's profile opens their conversations with it).
 */
type InboxParams = {
  unreadOnly?: string;
  status?: string;
  assignee?: string;
  search?: string;
  customerId?: string;
};

type InboxNavigation = {
  setParams: (params: InboxParams) => void;
};

function filterOf(
  filter: InboxFilter,
  search: string,
  customerId: string | undefined
): ConversationFilter {
  return {
    ...(customerId ? { customerId } : {}),
    ...(filter.unread ? { unreadOnly: true } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.assignee ? { assignee: filter.assignee } : {}),
    ...(search ? { search: SEARCH_MAX ? search.slice(0, SEARCH_MAX) : search } : {}),
  };
}

/** The space between two conversation cards. */
function Gap() {
  return <View className="h-2" />;
}

/**
 * The Inbox tab: the workspace's conversations with
 * customers, the most recent first, with a search and, beside it, a filter
 * button that opens the filters in a bottom sheet (the shopper app's). It reads the
 * list again on a message's push, on pull to refresh and when the app returns
 * to the front (`useConversations`). Opened for one customer, it lists theirs,
 * said in a chip under the search ("Showing: Rina Begum") whose cross shows
 * everyone's again.
 */
export function InboxScreen() {
  const t = useTranslations('inbox');
  const tabs = useTranslations('tabs');
  const common = useTranslations('common');
  const bottom = useBottomSpace();
  const navigation = useNavigation<InboxNavigation>();
  const params = useLocalSearchParams<InboxParams>();
  const filter: InboxFilter = {
    unread: params.unreadOnly === 'true',
    status: CONVERSATION_STATUSES.includes(params.status as InboxFilter['status'] & string)
      ? (params.status as InboxFilter['status'])
      : null,
    assignee: CONVERSATION_ASSIGNEE_FILTERS.includes(
      params.assignee as InboxFilter['assignee'] & string
    )
      ? (params.assignee as InboxFilter['assignee'])
      : null,
  };
  // One customer's, as the store names them; an id it would refuse lists nobody's.
  const customerId = ConversationListQuery.shape.customerId.safeParse(params.customerId).data;
  const customer = useCustomer(customerId ?? '');
  const setFilter = (value: InboxFilter) =>
    navigation.setParams({
      unreadOnly: value.unread ? 'true' : undefined,
      status: value.status ?? undefined,
      assignee: value.assignee ?? undefined,
    });
  const [filtering, setFiltering] = useState(false);
  const active = filterCount(filter);
  const activeWords = [
    filter.unread ? t('filters.unread') : null,
    filter.assignee === 'me' ? t('filters.mine') : null,
    filter.assignee === 'none' ? t('filters.unassigned') : null,
    filter.status ? t(`filters.${filter.status}`) : null,
  ].filter(Boolean);
  const asked = params.search ?? '';
  const [search, setSearch] = useState(asked);
  const [lastAsked, setLastAsked] = useState(asked);
  if (asked !== lastAsked) {
    setLastAsked(asked);
    if (!asked) setSearch('');
  }
  const term = useDebouncedValue(search.trim());
  useEffect(() => {
    if (term !== asked) navigation.setParams({ search: term || undefined });
  }, [term, asked, navigation]);
  const list = useConversations(filterOf(filter, term, customerId));
  const pull = usePullToRefresh(list.refetch);
  const items = list.data?.items ?? [];
  const customerName = customer.data?.name ?? items[0]?.contact.name ?? t('filters.oneCustomer');

  const empty = term
    ? { title: t('emptySearch.title'), body: t('emptySearch.body', { search: term }) }
    : customerId && !active
      ? { title: t('emptyCustomer.title'), body: t('emptyCustomer.body', { name: customerName }) }
      : filter.status
        ? { title: t('emptyFiltered.title'), body: t('emptyFiltered.body') }
        : filter.assignee
          ? {
              title: t(`emptyAssignee.${filter.assignee}.title`),
              body: t(`emptyAssignee.${filter.assignee}.body`),
            }
          : filter.unread
            ? { title: t('emptyUnread.title'), body: t('emptyUnread.body') }
            : { title: t('empty.title'), body: t('empty.body') };

  const content = () => {
    if (list.isPending) return <LoadingState shape="rows" leading />;
    if (list.isError && !list.data) {
      return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
    }
    return (
      <FlashList
        data={items}
        extraData={items.length}
        keyExtractor={(conversation) => conversation.id}
        renderItem={({ item }) => (
          <ConversationRow
            conversation={item}
            onPress={() =>
              router.push({ pathname: '/conversations/[id]', params: { id: item.id } })
            }
          />
        )}
        ItemSeparatorComponent={Gap}
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
          <EmptyState icon="inbox" placement="top" title={empty.title} body={empty.body} />
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
    <Screen header={<TabHeader title={tabs('inbox')} />}>
      <View className="gap-2 px-4 pb-3">
        <View className="flex-row items-center gap-2">
          <SearchField
            label={t('search')}
            value={search}
            onChangeText={setSearch}
            className="flex-1"
          />
          <IconButton
            icon="filter"
            label={active ? t('filters.buttonActive', { count: active }) : t('filters.button')}
            count={active}
            onPress={() => setFiltering(true)}
          />
        </View>
        {/* A plain view around the chip, its row the screen's width: in a browser a horizontal list grows to fill the screen. */}
        {customerId ? (
          <View className="-mx-4">
            <RemovableChips
              chips={[{ key: 'customer', label: t('filters.showing', { filters: customerName }) }]}
              removeLabel={() => t('filters.removeCustomer', { name: customerName })}
              onRemove={() => navigation.setParams({ customerId: undefined })}
            />
          </View>
        ) : null}
        {active ? (
          <View className="flex-row items-center gap-2 px-2">
            <Text variant="meta" numberOfLines={1} className="flex-1">
              {t('filters.showing', { filters: activeWords.join(common('separator')) })}
            </Text>
            <TextLink label={t('filters.clear')} onPress={() => setFilter(NO_FILTER)} />
          </View>
        ) : null}
      </View>
      <InboxFilterSheet
        visible={filtering}
        value={filter}
        onApply={setFilter}
        onClose={() => setFiltering(false)}
      />
      {content()}
    </Screen>
  );
}
