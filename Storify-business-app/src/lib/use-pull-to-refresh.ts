import { useCallback, useState } from 'react';

/**
 * Pull to refresh that spins for the operator's own pull only: the screen's
 * reads behind their back (a push, a step on an order, the app coming back to
 * the front) do not show it, which would make it flicker. Each read goes out
 * with its ETag, so an unchanged screen costs a 304.
 */
export function usePullToRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refetch().finally(() => setRefreshing(false));
  }, [refetch]);

  return { refreshing, onRefresh };
}
