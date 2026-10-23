import { skipToken, useQuery } from '@tanstack/react-query';

import { getHome } from '@/api/endpoints/home';
import { etagQuery, selectData } from '@/api/etag-query';
import { queryKeys } from '@/api/query-keys';
import { useWorkspaceScope } from '@/features/workspace/use-workspace';

/**
 * Home's figures for the workspace: the tiles the operator may see, in their
 * order within the financial and attention groups. Skip unknown kinds. Asked on
 * opening Home, on pull to refresh (`refetch`) and on returning to the
 * foreground, each time with the last ETag: unchanged figures are a 304.
 */
export function useHome() {
  const scope = useWorkspaceScope();

  return useQuery({
    queryKey: queryKeys.home(scope),
    queryFn: scope ? etagQuery((options) => getHome(scope, options)) : skipToken,
    select: selectData,
  });
}
