import { useCallback, useState } from 'react';

import { authClient } from '@/lib/auth-client';

import { useAuthTask } from './auth-request';

/** How the second step is answered: the authenticator app's code, or one of the saved backup codes. */
export type TwoFactorMethod = 'totp' | 'backupCode';

/**
 * Where a sign-in is. A screen draws the step it is given; it never navigates
 * after `signedIn`: the root layout leaves the sign-in screen by itself the
 * moment the session exists, and GET /me then says where the operator works.
 */
export type SignInStep =
  /** Email and password. */
  | { name: 'credentials' }
  /**
   * The password was right and the account has two-step verification (as
   * administrators often do). `canUseAuthenticator` is false for an account
   * whose authenticator was never set up: only a backup code lets it in.
   */
  | { name: 'twoFactor'; email: string; method: TwoFactorMethod; canUseAuthenticator: boolean }
  /** The store accepted the operator. */
  | { name: 'signedIn' };

type SignInAnswer = {
  twoFactorRedirect?: boolean;
  /** Which second steps the account can use: `totp` when its authenticator is set up. */
  twoFactorMethods?: string[];
};

/** Refusals of a code after which the two-step sign-in is gone: the operator starts again from the password. */
const ENDS_TWO_FACTOR = new Set([
  'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE',
  'INVALID_TWO_FACTOR_COOKIE',
]);

/**
 * Signing in with email and password, then the second step when the account
 * has two-step verification.
 *
 * Lockout, attempts left and rate limits are the store's; their sentences are
 * in `error`, with the field each concerns. A shopper's account is refused
 * (`error.code` `BIZ_APP_OPERATORS_ONLY`) and no session is made.
 */
export function useSignIn() {
  const { run, fail, clearError, isPending, error } = useAuthTask();
  const [step, setStep] = useState<SignInStep>({ name: 'credentials' });

  const signIn = useCallback(
    async (values: { email: string; password: string }) => {
      const email = values.email.trim();
      const outcome = await run<SignInAnswer>((fetchOptions) =>
        authClient.signIn.email({ email, password: values.password }, fetchOptions)
      );
      if (!outcome) return;
      if (outcome.refusal) {
        fail(outcome.refusal);
        return;
      }

      if (outcome.data.twoFactorRedirect) {
        // An older server lists no methods; the authenticator is then the one it has.
        const canUseAuthenticator = outcome.data.twoFactorMethods?.includes('totp') ?? true;
        setStep({
          name: 'twoFactor',
          email,
          method: canUseAuthenticator ? 'totp' : 'backupCode',
          canUseAuthenticator,
        });
      } else {
        setStep({ name: 'signedIn' });
      }
    },
    [run, fail]
  );

  /** Answers the second step with a code, of the kind the step asks for. */
  const verifyCode = useCallback(
    async (code: string) => {
      if (step.name !== 'twoFactor') return;
      const outcome = await run<unknown>((fetchOptions) =>
        step.method === 'totp'
          ? authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, '') }, fetchOptions)
          : authClient.twoFactor.verifyBackupCode({ code: code.trim() }, fetchOptions)
      );
      if (!outcome) return;

      if (outcome.refusal) {
        fail(outcome.refusal);
        if (outcome.refusal.code && ENDS_TWO_FACTOR.has(outcome.refusal.code)) {
          setStep({ name: 'credentials' });
        }
        return;
      }
      setStep({ name: 'signedIn' });
    },
    [step, run, fail]
  );

  /** "Use a backup code", and back to the authenticator. */
  const switchMethod = useCallback(
    (method: TwoFactorMethod) => {
      if (step.name !== 'twoFactor' || (method === 'totp' && !step.canUseAuthenticator)) return;
      clearError();
      setStep({ ...step, method });
    },
    [step, clearError]
  );

  /** Back to email and password, from the code step. */
  const restart = useCallback(() => {
    clearError();
    setStep({ name: 'credentials' });
  }, [clearError]);

  return { step, isPending, error, signIn, verifyCode, switchMethod, restart };
}
