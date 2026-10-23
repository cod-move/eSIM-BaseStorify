import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { IntlProvider } from 'use-intl';

import { api } from '@/api/api';
import { useGate } from '@/api/gate';
import { mockFetch } from '@/api/mocks/server';
import { queryKeys } from '@/api/query-keys';
import { transport } from '@/api/transport';
import { Text } from '@/components/ui/text';
import { env } from '@/config/env';
import { API_BASE_PATH, type Config } from '@/contracts/mobile/shop/v1';
import { getMessages } from '@/i18n/messages';

import { AppGate } from '../app-gate';

// The app's own client on the mock store; a test may put a canned answer in front of it.
jest.mock('@/api/transport', () => {
  const actual = jest.requireActual<typeof import('@/api/transport')>('@/api/transport');
  return { transport: jest.fn(actual.transport) };
});

/** The app under the gate, with a store whose minimum is above this version. */
async function renderBelowMinimum() {
  const response = await mockFetch(`${env.apiUrl}${API_BASE_PATH}/en/config`);
  const { data } = (await response.json()) as { data: Config };
  const release = { minVersion: '999.0.0', latestVersion: '999.0.0' };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(queryKeys.config('en'), {
    data: { ...data, app: { ...data.app, ios: release, android: release } },
  });

  await render(
    <QueryClientProvider client={client}>
      <IntlProvider locale="en" messages={getMessages('en')}>
        <AppGate>
          <Text>The tabs</Text>
        </AppGate>
      </IntlProvider>
    </QueryClientProvider>
  );
  return client;
}

beforeEach(() => {
  jest.useFakeTimers();
  useGate.setState({ updateRequired: false, maintenance: null });
});

afterEach(() => jest.useRealTimers());

describe('the app gate below the store’s minimum version', () => {
  it('opens the app with an update prompt that can be put off, and asks again on a 426', async () => {
    const client = await renderBelowMinimum();

    expect(await screen.findByText('The tabs')).toBeOnTheScreen();
    expect(await screen.findByText('Update the app')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
    expect(useGate.getState().updateRequired).toBe(false);
    // The sheet slides out, then leaves.
    await act(() => jest.runAllTimersAsync());
    expect(screen.queryByText('Update the app')).toBeNull();
    expect(screen.getByText('The tabs')).toBeOnTheScreen();

    // A change the store refuses for this version asks again.
    jest
      .mocked(transport)
      .mockImplementationOnce(async () =>
        Response.json(
          { success: false, code: 'APP_UPDATE_REQUIRED', message: 'Update required' },
          { status: 426 }
        )
      );
    await act(() =>
      expect(api.data({ locale: 'en', method: 'POST', path: '/cart/items' })).rejects.toThrow()
    );

    expect(await screen.findByText('Update the app')).toBeOnTheScreen();
    expect(screen.getByText('The tabs')).toBeOnTheScreen();

    screen.unmount();
    client.clear();
  });
});
