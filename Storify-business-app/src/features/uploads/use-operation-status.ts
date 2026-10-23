import { skipToken, useQuery } from '@tanstack/react-query';

import { getOperation } from '@/api/endpoints/operations';
import { isApiError } from '@/api/errors';
import { queryKeys } from '@/api/query-keys';
import { useWorkspaceScope } from '@/features/workspace/use-workspace';

/** Poll the same tap until the server confirms its outcome; never send the write here. */
export function useOperationStatus(key: string | null, { poll = true } = {}) {
  const scope = useWorkspaceScope();
  return useQuery({
    queryKey: queryKeys.operation(scope, key ?? ''),
    queryFn: scope && key ? ({ signal }) => getOperation(scope, key, signal) : skipToken,
    refetchInterval: (query) => {
      if (!poll || !key) return false;
      if (isApiError(query.state.error) && query.state.error.status < 500) return false;
      const operation = query.state.data;
      if (operation?.state === 'succeeded' || operation?.state === 'failed') return false;
      return (operation?.retryAfterSeconds ?? 2) * 1000;
    },
  });
}
