import type { ReactElement, ReactNode } from 'react';
import { FlatList, View } from 'react-native';

import { useBottomSpace } from '@/components/ui/screen';
import { EmptyState, ErrorState, InlineError, LoadingState } from '@/components/ui/state-view';
import type { IconName } from '@/components/ui/icon';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';

/** What the eSIM lists need of an infinite query. */
type PagedQuery<T> = {
  data: { items: T[] } | undefined;
  error: Error | null;
  isPending: boolean;
  isError: boolean;
  isFetchNextPageError: boolean;
  isRefetchError: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  refetch: () => Promise<unknown>;
  fetchNextPage: () => Promise<unknown>;
};

/**
 * A list a page at a time, as the app's own lists (customers, orders): a pull
 * reads it again, the end of it asks for the next page, a failed page waits
 * for its "Try again", and an empty list says why.
 */
export function PagedList<T extends { id: string }>({
  query,
  renderItem,
  header,
  empty,
}: {
  query: PagedQuery<T>;
  renderItem: (item: T) => ReactElement;
  header?: ReactNode;
  empty: { icon: IconName; title: string; body: string };
}) {
  const bottom = useBottomSpace();
  const pull = usePullToRefresh(query.refetch);

  if (query.isPending) return <LoadingState shape="rows" leading />;
  if (query.isError && !query.data) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  return (
    <FlatList
      data={query.data?.items ?? []}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => renderItem(item)}
      ItemSeparatorComponent={Gap}
      ListHeaderComponent={header ? <View className="pb-3">{header}</View> : null}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottom }}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) {
          void query.fetchNextPage();
        }
      }}
      ListEmptyComponent={
        <EmptyState icon={empty.icon} placement="top" title={empty.title} body={empty.body} />
      }
      ListFooterComponent={
        query.isFetchNextPageError || query.isRefetchError ? (
          <InlineError
            error={query.error}
            onRetry={() =>
              void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())
            }
            className="mt-3"
          />
        ) : query.isFetchingNextPage ? (
          <LoadingState shape="rows" leading />
        ) : null
      }
    />
  );
}

function Gap() {
  return <View className="h-2" />;
}
