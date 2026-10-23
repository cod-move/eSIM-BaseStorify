import { renderHook, waitFor } from '@testing-library/react-native';
import Constants from 'expo-constants';
import { getPermissionsAsync } from 'expo-notifications';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { registerDevice } from '@/api/endpoints/devices';
import { getMessages } from '@/i18n/messages';

import { usePushRegistration } from '../use-push-registration';

type Permission = Awaited<ReturnType<typeof getPermissionsAsync>>;

let mockSessionId = 'session_1';
jest.mock('@/features/auth/use-session', () => ({
  useSession: () => ({
    user: { id: 'user_1' },
    sessionId: mockSessionId,
    isSignedIn: true,
    isPending: false,
  }),
}));
jest.mock('@/api/endpoints/devices', () => ({
  registerDevice: jest.fn(async () => ({})),
  removeDevice: jest.fn(async () => ({})),
}));

const config = Constants.expoConfig as { extra?: Record<string, unknown> };

function wrapper({ children }: PropsWithChildren) {
  return (
    <IntlProvider locale="en" messages={getMessages('en')}>
      {children}
    </IntlProvider>
  );
}

beforeEach(() => {
  mockSessionId = 'session_1';
  config.extra = { eas: { projectId: 'business-app-project' } };
  jest
    .mocked(getPermissionsAsync)
    .mockImplementation(async () => ({ granted: true }) as Permission);
});
afterEach(() => {
  delete config.extra;
  jest
    .mocked(getPermissionsAsync)
    .mockImplementation(async () => ({ granted: false }) as Permission);
});

describe('registering this phone for push', () => {
  it('registers again when the session changes under the same person', async () => {
    const rendered = await renderHook(() => usePushRegistration(), { wrapper });
    await waitFor(() => expect(registerDevice).toHaveBeenCalledTimes(1));

    // A password change that signed out the other devices ended this session
    // too, and the store stopped sending to the phone; it gave it a new one.
    mockSessionId = 'session_2';
    await rendered.rerender(undefined);
    await waitFor(() => expect(registerDevice).toHaveBeenCalledTimes(2));
  });
});
