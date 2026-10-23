import { act } from '@testing-library/react-native';

import { sentEmails } from '@/api/mocks/routes/auth';
import { mockFetch } from '@/api/mocks/server';
import { env } from '@/config/env';

import { useForgotPassword } from '../use-forgot-password';
import { RESEND_PAUSE_SECONDS } from '../use-wait';
import { renderAuthHook, startFresh } from './auth-hook';

beforeEach(startFresh);

async function forgotPasswordHook() {
  const hook = await renderAuthHook(useForgotPassword);
  const request = (email: string) => act(() => hook.result.current.request(email));
  return { result: hook.result, request };
}

/** Asks the store for a reset link without the hook, as other phones and other tabs do. */
async function askAsSomeoneElse(email: string, times: number) {
  for (let time = 0; time < times; time += 1) {
    await mockFetch(`${env.apiUrl}/api/auth/forgot-password`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }
}

describe('useForgotPassword', () => {
  it('asks the store for a link, and says where to look', async () => {
    const { result, request } = await forgotPasswordHook();

    await request(' two-step@example.com ');

    expect(result.current.sentTo).toBe('two-step@example.com');
    expect(result.current.error).toBeNull();
    expect(result.current.secondsLeft).toBe(RESEND_PAUSE_SECONDS);
    expect(sentEmails()).toEqual([{ kind: 'passwordReset', to: 'two-step@example.com' }]);
  });

  it('says the same for an address that has no account', async () => {
    const { result, request } = await forgotPasswordHook();

    await request('nobody@example.com');

    // The store answers alike, so as not to tell who has an account.
    expect(result.current.sentTo).toBe('nobody@example.com');
    expect(result.current.error).toBeNull();
  });

  it('does not ask again for the same address during the pause', async () => {
    const { result, request } = await forgotPasswordHook();

    await request('two-step@example.com');
    await request('TWO-STEP@example.com');
    expect(sentEmails()).toHaveLength(1);

    // Another address is another request, with its own pause.
    await request('unverified@example.com');
    expect(sentEmails()).toHaveLength(2);
    expect(result.current.sentTo).toBe('unverified@example.com');
  });

  it('words an address that is not one, beside the email field', async () => {
    const { result, request } = await forgotPasswordHook();

    await request('nadia');

    expect(result.current.error).toEqual({
      message: 'Please enter a valid email address.',
      field: 'email',
      code: 'INVALID_EMAIL',
    });
    expect(result.current.sentTo).toBeNull();
    expect(sentEmails()).toEqual([]);
  });

  it("words the store's limit for one address, and waits as long as it asks", async () => {
    const { result, request } = await forgotPasswordHook();
    await askAsSomeoneElse('nadia@example.com', 5);

    await request('nadia@example.com');

    expect(result.current.sentTo).toBeNull();
    expect(result.current.error?.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(result.current.error?.message).toMatch(
      /^Too many attempts\. Wait \d+ minutes?, then try again\.$/
    );
    // The wait the store sent, not the usual pause.
    expect(result.current.secondsLeft).toBeGreaterThan(RESEND_PAUSE_SECONDS);
  });

  it('goes back to the email field to try another address', async () => {
    const { result, request } = await forgotPasswordHook();
    await request('nadia@example.com');

    await act(() => result.current.reset());

    expect(result.current.sentTo).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
