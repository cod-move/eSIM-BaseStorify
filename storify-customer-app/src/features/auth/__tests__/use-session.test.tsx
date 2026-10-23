import { useQueryClient } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react-native';

import { confirmMockEmail, setMockAuthSettings } from '@/api/mocks/routes/auth';
import { MOCK_PASSWORD } from '@/api/mocks/server';
import { queryKeys } from '@/api/query-keys';
import { authClient } from '@/lib/auth-client';

import { useSession } from '../use-session';
import { renderAuthHook, startFresh } from './auth-hook';

beforeEach(startFresh);

function sessionHook() {
  return renderAuthHook(() => ({ session: useSession(), client: useQueryClient() }));
}

describe('useSession', () => {
  it('is nobody on a phone that holds no session', async () => {
    const { result } = await sessionHook();

    await waitFor(() => expect(result.current.session.isPending).toBe(false));
    expect(result.current.session).toEqual({
      user: null,
      isSignedIn: false,
      isPending: false,
      awaitingEmail: null,
    });
  });

  it('is the shopper the store let in', async () => {
    await act(async () => {
      await authClient.signIn.email({ email: 'nadia@example.com', password: MOCK_PASSWORD });
    });
    const { result } = await sessionHook();

    await waitFor(() => expect(result.current.session.isSignedIn).toBe(true));
    expect(result.current.session.user?.email).toBe('nadia@example.com');
    expect(result.current.session.awaitingEmail).toBeNull();
  });

  it('is not a sign-in while the store refuses a session whose email is unconfirmed', async () => {
    setMockAuthSettings({ emailVerificationRequired: true });
    await act(async () => {
      await authClient.signUp.email({
        name: 'Rafi Ahmed',
        email: 'rafi@example.com',
        password: 'Sunflower7',
      });
    });
    const { result } = await sessionHook();

    // The store knows the session (it is "signed in") but answers 401 to the API.
    await waitFor(() => expect(result.current.session.awaitingEmail).toBe('rafi@example.com'));
    expect(result.current.session).toMatchObject({
      user: null,
      isSignedIn: false,
      isPending: false,
    });
  });

  it('starts working by itself once the link in the email has been followed', async () => {
    setMockAuthSettings({ emailVerificationRequired: true });
    await act(async () => {
      await authClient.signUp.email({
        name: 'Rafi Ahmed',
        email: 'rafi@example.com',
        password: 'Sunflower7',
      });
    });
    const { result } = await sessionHook();
    await waitFor(() => expect(result.current.session.awaitingEmail).not.toBeNull());

    // The shopper goes to their inbox, and comes back to the app.
    confirmMockEmail('rafi@example.com');
    await act(async () => {
      await result.current.client.refetchQueries({ queryKey: queryKeys.me('en') });
    });

    await waitFor(() => expect(result.current.session.isSignedIn).toBe(true));
    expect(result.current.session.user?.email).toBe('rafi@example.com');
    expect(result.current.session.awaitingEmail).toBeNull();
  });
});
