import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import * as endpoints from '@/api/endpoints/preferences';
import { ApiError } from '@/api/errors';
import { queryKeys } from '@/api/query-keys';
import type { Preferences } from '@/contracts/mobile/shop/v1';
import { useLocale } from '@/i18n/locale-store';

import { useTogglePreference } from '../use-preferences';

const listWith = (orders: boolean, deals: boolean): Preferences => ({
  groups: [
    {
      key: 'EMAIL',
      title: 'Email Notifications',
      items: [
        { key: 'ORDER_UPDATES', title: 'Order Updates', description: 'Status', enabled: orders },
        { key: 'PROMOTIONS', title: 'Promotions', description: 'Offers', enabled: deals },
      ],
    },
  ],
});

let sent: jest.SpiedFunction<typeof endpoints.updatePreferences>;
afterEach(() => sent.mockRestore());

async function renderToggle(onRefused: (error: Error) => void = () => undefined) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = await renderHook(
    () => ({ locale: useLocale(), ...useTogglePreference(onRefused) }),
    { wrapper }
  );
  const key = queryKeys.preferences(hook.result.current.locale);
  client.setQueryData(key, listWith(true, false));
  return { hook, cached: () => client.getQueryData<Preferences>(key) };
}

describe('a preference switch', () => {
  it('sends one PATCH with its key and value, and the answer replaces the list', async () => {
    // The store's answer also carries a change made elsewhere: orders went off.
    const answer = listWith(false, true);
    sent = jest.spyOn(endpoints, 'updatePreferences').mockResolvedValue(answer);
    const { hook, cached } = await renderToggle();

    await act(async () => {
      hook.result.current.toggle({ key: 'PROMOTIONS', enabled: true });
      hook.result.current.toggle({ key: 'PROMOTIONS', enabled: true });
    });

    await waitFor(() => expect(cached()).toEqual(answer));
    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent.mock.calls[0]?.[1]).toEqual({
      preferences: [{ key: 'PROMOTIONS', enabled: true }],
    });
  });

  it('goes back when the store refuses, and hands on the refusal', async () => {
    const refusal = new ApiError(400, 'VALIDATION_ERROR', 'Not now', {
      reason: 'PREFERENCE_UNAVAILABLE',
      errors: { preferences: ['Not now'] },
    });
    sent = jest.spyOn(endpoints, 'updatePreferences').mockRejectedValue(refusal);
    const refused = jest.fn();
    const { hook, cached } = await renderToggle(refused);

    await act(async () => hook.result.current.toggle({ key: 'ORDER_UPDATES', enabled: false }));

    await waitFor(() => expect(refused).toHaveBeenCalledWith(refusal));
    expect(cached()).toEqual(listWith(true, false));
  });
});
