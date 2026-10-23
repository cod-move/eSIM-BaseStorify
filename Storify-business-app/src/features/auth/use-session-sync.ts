import { useIsRestoring, useQueryClient, type QueryClient } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- emptying its caches, not drawing a picture
import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';

import { clearAttempts } from '@/api/keyed-mutation';
import { ME_QUERIES, PRIVATE_QUERIES } from '@/api/query-keys';
import type { Me } from '@/contracts/mobile/biz/v1';
import { clearPendingReplies } from '@/features/inbox/pending-replies';
import { clearPayoutCurrencies } from '@/features/more/payout-currency';
import { clearProductDrafts } from '@/features/products/editor/drafts';
import { clearCreationDrafts } from '@/features/orders/creation/draft';
import { clearReturnDrafts } from '@/features/returns/store';
import { clearPendingNotificationOpen } from '@/features/shell/use-open-notification';
import { storage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';

import { useSession } from './use-session';

/**
 * What has to happen whenever the person using the app changes, in one place:
 * everything cached that belonged to the previous person (who they are, their
 * workspaces' orders, products, messages, the pictures shown to them) is
 * dropped and asked for again, and the changes still waiting for an answer
 * under their name (replies on their way included) and the choices they made
 * for this use of the app (the payout currency) are forgotten, so one person
 * never sees, or repeats, another's.
 *
 * The first answer of a start counts too: the GET /me kept on the device is
 * the last person's, and they may no longer be signed in (their session ran
 * out, or was ended elsewhere, while the app was closed). Kept for somebody
 * else, it goes before the next person signs in.
 *
 * Mounted once, in the root layout.
 */
export function useSessionSync(): void {
  const { user, isPending } = useSession();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  // Whose the cache kept on the device is can be told only once it is back.
  const restoring = useIsRestoring();
  const previous = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (isPending || restoring) return;

    const before = previous.current;
    previous.current = userId;
    if (before === userId) return;
    // The first answer: what the device kept is this person's, or nobody's,
    // unless it holds somebody else's GET /me, which goes as at any change.
    if (before === undefined && !keptForSomebodyElse(queryClient, userId)) return;

    clearAttempts();
    clearPendingReplies();
    clearProductDrafts();
    clearCreationDrafts();
    clearReturnDrafts();
    clearPendingNotificationOpen();
    clearPayoutCurrencies();
    // The copy kept on the device (who the previous person is) goes now, not
    // with the persister's next write, which a quit app would never make.
    storage.remove(STORAGE_KEYS.queryCache);
    // Their pictures too: products, customers, conversations, their own face.
    void Image.clearMemoryCache().catch(() => undefined);
    void Image.clearDiskCache().catch(() => undefined);
    void queryClient.resetQueries({
      queryKey: PRIVATE_QUERIES,
      // Signed in from signed out: nothing private is read while nobody is
      // signed in, so a read already on its way is the new person's own (their
      // first GET /me). Stopping it would only send it again.
      ...(before === null ? { predicate: (query) => query.state.fetchStatus === 'idle' } : {}),
    });
  }, [userId, isPending, restoring, queryClient]);
}

/** Whether the cache holds GET /me of somebody other than `userId` (of anybody, when nobody is signed in). */
function keptForSomebodyElse(queryClient: QueryClient, userId: string | null): boolean {
  return queryClient
    .getQueriesData<Me>({ queryKey: ME_QUERIES })
    .some(([, me]) => me !== undefined && me.id !== userId);
}
