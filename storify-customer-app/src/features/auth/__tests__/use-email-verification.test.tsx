import { act } from '@testing-library/react-native';

import { authRoutes, sentEmails } from '@/api/mocks/routes/auth';
import { mockFetch } from '@/api/mocks/server';
import { env } from '@/config/env';

import { useEmailConfirmedPage, useResendVerificationEmail } from '../use-email-verification';
import { RESEND_PAUSE_SECONDS } from '../use-wait';
import { renderAuthHook, startFresh } from './auth-hook';

beforeEach(startFresh);

async function resendHook(email = 'unverified@example.com') {
  const hook = await renderAuthHook(() => useResendVerificationEmail(email));
  const resend = () => act(() => hook.result.current.resend());
  return { result: hook.result, resend };
}

describe('useResendVerificationEmail', () => {
  it('sends the link again, then waits before it will send another', async () => {
    const { result, resend } = await resendHook();

    await resend();

    expect(result.current.sent).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.secondsLeft).toBe(RESEND_PAUSE_SECONDS);
    expect(sentEmails()).toEqual([{ kind: 'verification', to: 'unverified@example.com' }]);

    await resend();
    expect(sentEmails()).toHaveLength(1);
  });

  it("words the store's limit, and waits as long as it asks", async () => {
    const { result, resend } = await resendHook();
    for (let time = 0; time < 5; time += 1) {
      await mockFetch(`${env.apiUrl}/api/auth/send-verification-email`, {
        method: 'POST',
        body: JSON.stringify({ email: 'unverified@example.com' }),
      });
    }

    await resend();

    expect(result.current.sent).toBe(false);
    expect(result.current.error?.message).toMatch(
      /^Too many attempts\. Wait \d+ minutes?, then try again\.$/
    );
    expect(result.current.secondsLeft).toBeGreaterThan(RESEND_PAUSE_SECONDS);
  });

  it('says so when no answer comes back', async () => {
    const route = authRoutes.find(({ path }) => path === '/send-verification-email')!;
    const down = jest.spyOn(route, 'handle').mockImplementation(() => {
      throw new TypeError('Network request failed');
    });
    const { result, resend } = await resendHook();

    await resend();

    expect(result.current.error).toEqual({
      message: 'Please check your internet connection and try again.',
      field: null,
      code: null,
    });
    expect(result.current.sent).toBe(false);
    down.mockRestore();
  });
});

describe('useEmailConfirmedPage', () => {
  it("is the store's website page for a confirmed address, in the app's language", async () => {
    const { result } = await renderAuthHook(useEmailConfirmedPage);

    expect(result.current).toMatch(/^https?:\/\/[^/]+\/en\/email-verified$/);
  });
});
