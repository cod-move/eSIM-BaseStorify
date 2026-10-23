/**
 * The shopper's preferences: what the store sends them. Both routes answer the
 * whole list; a refused change changes nothing.
 */
import {
  PREFERENCE_KEYS,
  UpdatePreferencesRequest,
  type PreferenceGroup,
  type Preferences,
} from '@/contracts/mobile/shop/v1';

import { seededPreferences } from '../fixtures/preferences';
import { MockError, requireUser, type MockContext, type MockRoute } from '../kit';

/** User id → their switches. The first look seeds them. */
const lists = new Map<string, PreferenceGroup[]>();

export function reset(): void {
  lists.clear();
}

function listOf(ctx: MockContext): PreferenceGroup[] {
  const user = requireUser(ctx);
  let list = lists.get(user.id);
  if (!list) {
    list = seededPreferences();
    lists.set(user.id, list);
  }
  return list;
}

function answer(list: PreferenceGroup[]): Preferences {
  return {
    groups: list.map((group) => ({ ...group, items: group.items.map((item) => ({ ...item })) })),
  };
}

function refuse(message: string, reason?: string): never {
  throw new MockError(400, 'VALIDATION_ERROR', message, reason, { preferences: [message] });
}

function isKnown(key: string): boolean {
  return PREFERENCE_KEYS.some((known) => known === key);
}

export const routes: MockRoute[] = [
  { method: 'GET', path: '/me/preferences', handle: (ctx) => answer(listOf(ctx)) },
  {
    method: 'PATCH',
    path: '/me/preferences',
    handle: (ctx) => {
      const list = listOf(ctx);
      const parsed = UpdatePreferencesRequest.safeParse(ctx.body);
      if (!parsed.success) refuse('The preferences are not valid');

      const items = list.flatMap((group) => group.items);
      const changes = parsed.data.preferences.map((change) => {
        const item = items.find((i) => i.key === change.key);
        if (item) return { item, enabled: change.enabled };
        // A switch of the contract this store does not offer now (it sends no texts).
        if (isKnown(change.key)) {
          refuse('This store does not send that now', 'PREFERENCE_UNAVAILABLE');
        }
        return refuse('This store has no such preference', 'PREFERENCE_UNKNOWN');
      });

      for (const { item, enabled } of changes) item.enabled = enabled;
      return answer(list);
    },
  },
];
