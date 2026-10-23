import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Avatar } from '@/components/ui/avatar';
import { Screen, StackHeader, useBottomSpace } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { EmptyState, ErrorState, InlineError, LoadingState } from '@/components/ui/state-view';
import { StatusChip } from '@/components/ui/status-chip';
import { Text } from '@/components/ui/text';
import type { CustomerListItem } from '@/contracts/mobile/biz/v1';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';

import { useCustomers } from './use-customers';

/**
 * The operator's customers: a search by name, email or
 * phone, then a card each, as the inbox's: the avatar, the name, how to reach
 * them, whether they have an account, and how many of their orders the
 * operator sees. A card opens their profile.
 */
export function CustomersScreen() {
  const t = useTranslations('customers');
  const bottom = useBottomSpace();
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim());
  const list = useCustomers(term);
  const pull = usePullToRefresh(list.refetch);
  const items = list.data ?? [];

  const content = () => {
    if (list.isPending) return <LoadingState shape="rows" leading />;
    if (list.isError && !list.data) {
      return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
    }
    return (
      <FlatList
        data={items}
        keyExtractor={(customer) => customer.id}
        renderItem={({ item }) => <CustomerCard customer={item} />}
        ItemSeparatorComponent={Gap}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottom }}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          // A page that failed waits for its "Try again", not for the next scroll.
          if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError) {
            void list.fetchNextPage();
          }
        }}
        ListEmptyComponent={
          <EmptyState
            icon="users"
            placement="top"
            title={term ? t('emptySearch.title') : t('empty.title')}
            body={term ? t('emptySearch.body', { search: term }) : t('empty.body')}
          />
        }
        ListFooterComponent={
          list.isFetchNextPageError || list.isRefetchError ? (
            <InlineError
              error={list.error}
              onRetry={() =>
                void (list.isFetchNextPageError ? list.fetchNextPage() : list.refetch())
              }
              className="mt-3"
            />
          ) : list.isFetchingNextPage ? (
            <LoadingState shape="rows" leading />
          ) : null
        }
      />
    );
  };

  return (
    <Screen header={<StackHeader title={t('title')} icon="users" />}>
      <View className="px-4 pb-3">
        <SearchField label={t('search')} value={search} onChangeText={setSearch} />
      </View>
      {content()}
    </Screen>
  );
}

function Gap() {
  return <View className="h-2" />;
}

function CustomerCard({ customer }: { customer: CustomerListItem }) {
  const t = useTranslations('customers');
  const common = useTranslations('common');
  const contact = [customer.email, customer.phone].filter(Boolean).join(common('separator'));
  const kind = t(`kinds.${customer.kind}`);
  const orders = t('orderCount', { count: customer.orderCount });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[customer.name, contact, kind, orders]
        .filter(Boolean)
        .join(common('listSeparator'))}
      onPress={() => router.push({ pathname: '/customers/[id]', params: { id: customer.id } })}
      className="min-h-[76px] flex-row items-center gap-3 rounded-[20px] border border-transparent bg-surface p-3 active:opacity-80 dark:border-border">
      <Avatar name={customer.name} imageUrl={customer.imageUrl} size="lg" />
      <View className="flex-1 gap-1">
        <Text variant="label" numberOfLines={1}>
          {customer.name}
        </Text>
        {contact ? (
          <Text variant="meta" numberOfLines={1}>
            {contact}
          </Text>
        ) : null}
        <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
          <StatusChip tone={customer.kind === 'account' ? 'info' : 'neutral'} label={kind} />
          <Text variant="caption">{orders}</Text>
        </View>
      </View>
    </Pressable>
  );
}
