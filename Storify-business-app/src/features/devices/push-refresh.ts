import type { QueryKey } from '@tanstack/react-query';

import { NOTIFICATION_QUERIES, queryKeys } from '@/api/query-keys';
import type { WorkspaceScope } from '@/api/scope';
import { notificationTarget, notificationWorkspace, type AppTarget } from '@/lib/links';

/**
 * What a push the store sent is about, read from its `data` (`{ url, type,
 * notificationId }`, contract: devices.ts). The data comes from outside the
 * app: anything that is not a non-empty string is left out.
 */
export type PushData = {
  /** The dashboard path, the locale in front. */
  url: string | null;
  type: string | null;
  /** The notification it is, in GET /notifications: marked read when tapped. */
  notificationId: string | null;
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function readPushData(data: unknown): PushData {
  const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  return {
    url: text(record.url),
    type: text(record.type),
    notificationId: text(record.notificationId),
  };
}

/** The screen a push is about, when the app has one. */
export function pushTarget(data: unknown): AppTarget | null {
  const { url, type } = readPushData(data);
  return url ? notificationTarget(url, type ?? undefined) : null;
}

/**
 * What to read again when a push arrives while the app is open: the
 * notifications (the Account tab's dot) always, and the lists and figures of what it is
 * about in the workspace on screen (the inbox and its badge for a message,
 * the low-stock list and Home for low stock…). Only what is on screen is asked
 * for at once; the rest is read when it shows. A push about the other
 * workspace refreshes nothing of this one: its data is not held here.
 *
 * Orders are `useOrderPushRefresh`'s (features/orders), which reads the order
 * lists, Home and the order itself: not read twice from here.
 */
export function pushRefreshKeys(data: unknown, scope: WorkspaceScope | null): QueryKey[] {
  const keys: QueryKey[] = [NOTIFICATION_QUERIES];
  const { url, type } = readPushData(data);
  if (!url || !scope) return keys;
  const workspace = notificationWorkspace(url);
  if (workspace && workspace !== scope.workspace) return keys;

  const target = notificationTarget(url, type ?? undefined);
  switch (target?.screen) {
    case 'return':
      return [
        ...keys,
        queryKeys.returnDetail(scope, target.id),
        queryKeys.returnLists(scope),
        queryKeys.home(scope),
        queryKeys.orderLists(scope),
      ];
    case 'returns':
      return [
        ...keys,
        queryKeys.returnLists(scope),
        queryKeys.home(scope),
        queryKeys.orderLists(scope),
      ];
    case 'refund':
      return [
        ...keys,
        queryKeys.refund(scope, target.id),
        queryKeys.returnLists(scope),
        queryKeys.home(scope),
        queryKeys.orderLists(scope),
      ];
    case 'stock':
    case 'product':
      return [
        ...keys,
        queryKeys.product(scope, target.id),
        queryKeys.productStock(scope, target.id),
        queryKeys.productLists(scope),
        queryKeys.home(scope),
      ];
    case 'products':
      return [...keys, queryKeys.productLists(scope), queryKeys.home(scope)];
    case 'conversation':
      return [
        ...keys,
        queryKeys.conversationMessages(scope, target.id),
        queryKeys.conversationLists(scope),
        queryKeys.home(scope),
      ];
    case 'inbox':
      return [...keys, queryKeys.conversationLists(scope), queryKeys.home(scope)];
    case 'application':
      return [
        ...keys,
        queryKeys.vendorApplication(scope, target.id),
        queryKeys.vendorApplicationLists(scope),
      ];
    case 'applications':
      return [...keys, queryKeys.vendorApplicationLists(scope)];
    case 'payout':
    case 'payouts':
      return [...keys, queryKeys.payoutData(scope)];
    default:
      return keys;
  }
}
