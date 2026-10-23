import { useState } from 'react';

/**
 * For pull-to-refresh: the spinner shows while a refresh the shopper asked for
 * is running, and not during the quiet ones the app does by itself.
 */
export function useRefresh(refetch: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = () => {
    setRefreshing(true);
    void refetch().finally(() => setRefreshing(false));
  };

  return { refreshing, onRefresh };
}
