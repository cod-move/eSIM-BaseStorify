import { useCallback, useState } from 'react';

import { requestPasswordReset } from '@/lib/auth-client';

import { useAuthTask } from './auth-request';
import { RESEND_PAUSE_SECONDS, useWait } from './use-wait';

/**
 * "Forgot password": asks the store to email a reset link. The link opens the
 * store's website, where the new password is chosen; the app says "check your
 * email" (`sentTo`) and can ask again after a pause.
 *
 * The pause, and the wait the store asks for when it refuses, belong to one
 * address, as the store's limit does: `secondsLeft` counts down for the last
 * address asked for, and `request` does nothing for it until it reaches 0.
 */
export function useForgotPassword() {
  const { run, fail, clearError, isPending, error } = useAuthTask();
  const { secondsLeft, wait } = useWait();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [lastAddress, setLastAddress] = useState<string | null>(null);

  const request = useCallback(
    async (email: string) => {
      const address = email.trim();
      if (secondsLeft > 0 && address.toLowerCase() === lastAddress) return;

      const outcome = await run((fetchOptions) => requestPasswordReset(address, fetchOptions));
      if (!outcome) return;
      setLastAddress(address.toLowerCase());

      if (outcome.refusal) {
        // The route checks one thing, the address, and says so with no code.
        fail(
          outcome.refusal.status === 400 && !outcome.refusal.code
            ? { ...outcome.refusal, code: 'INVALID_EMAIL' }
            : outcome.refusal
        );
        wait(outcome.refusal.retryAfterSeconds ?? 0);
        return;
      }
      // The store answers the same whether or not the address has an account,
      // so as not to tell who has one.
      setSentTo(address);
      wait(RESEND_PAUSE_SECONDS);
    },
    [run, fail, wait, secondsLeft, lastAddress]
  );

  /** Back to the email field, to type another address. */
  const reset = useCallback(() => {
    clearError();
    setSentTo(null);
  }, [clearError]);

  return { request, sentTo, isPending, error, secondsLeft, reset };
}
