import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { getPreferences, updatePreferences } from '@/api/endpoints/preferences';
import { STALE } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import type { Preferences } from '@/contracts/mobile/shop/v1';
import { useSession } from '@/features/auth/use-session';
import { useLocale } from '@/i18n/locale-store';

/** The shopper's switches, grouped and ordered as the store sends them. */
export function usePreferences() {
  const locale = useLocale();
  const { isSignedIn } = useSession();

  return useQuery({
    queryKey: queryKeys.preferences(locale),
    queryFn: ({ signal }) => getPreferences(locale, signal),
    enabled: isSignedIn,
    staleTime: STALE.private,
  });
}

type Toggle = { key: string; enabled: boolean };

/** The list with one switch set: what the screen shows while the store saves it. */
function withSwitch(preferences: Preferences, { key, enabled }: Toggle): Preferences {
  return {
    groups: preferences.groups.map((group) => ({
      ...group,
      items: group.items.map((item) => (item.key === key ? { ...item, enabled } : item)),
    })),
  };
}

/**
 * Flips one switch: it moves at once, the store's answer (the whole list) then
 * replaces the list, and a refusal moves it back. A switch already being saved
 * ignores further taps, so a tap sends one PATCH. `onRefused` hears every
 * refusal, whichever switch it was.
 */
export function useTogglePreference(onRefused: (error: Error) => void) {
  const locale = useLocale();
  const queryClient = useQueryClient();
  const key = queryKeys.preferences(locale);
  const saving = useRef(new Set<string>());

  const set = (toggle: Toggle) =>
    queryClient.setQueryData<Preferences>(key, (current) =>
      current ? withSwitch(current, toggle) : current
    );

  const mutation = useMutation({
    mutationFn: (toggle: Toggle) => updatePreferences(locale, { preferences: [toggle] }),
    onMutate: async (toggle) => {
      await queryClient.cancelQueries({ queryKey: key });
      set(toggle);
    },
    onSuccess: (answer) => queryClient.setQueryData(key, answer),
    onError: (error, toggle) => {
      set({ key: toggle.key, enabled: !toggle.enabled });
      onRefused(error);
    },
    onSettled: (_answer, _error, toggle) => saving.current.delete(toggle.key),
  });

  const toggle = (change: Toggle) => {
    if (saving.current.has(change.key)) return;
    saving.current.add(change.key);
    mutation.mutate(change);
  };

  return { toggle };
}
