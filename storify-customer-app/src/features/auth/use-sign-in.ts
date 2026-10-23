import { useCallback, useState } from 'react';

import { authClient } from '@/lib/auth-client';

import { useAuthTask, type AuthRefusal } from './auth-request';
import type { GoogleIdToken } from './google-id-token';
import type { SignInValues } from './schemas';

/** How the second step is answered: the authenticator app's code, or one of the saved backup codes. */
export type TwoFactorMethod = 'totp' | 'backupCode';

/** The shopper the store let in, as the "Signing you in…" hand-off shows them. */
export type SignedInUser = { name: string; email: string; image: string | null };

/**
 * Where a sign-in is. A screen draws the step it is given; it never navigates
 * after `signedIn`: the root layout closes the sign-in screens by itself the
 * moment the session exists.
 */
export type SignInStep =
  /** Email and password. */
  | { name: 'credentials' }
  /**
   * The password was right and the account has two-step verification.
   * `canUseAuthenticator` is false for an account whose authenticator was never
   * set up: only a backup code lets it in.
   */
  | { name: 'twoFactor'; email: string; method: TwoFactorMethod; canUseAuthenticator: boolean }
  /**
   * The store wants this email confirmed before it signs the account in: "check
   * your email", with a way to send the link again (`useResendVerificationEmail`).
   */
  | { name: 'verifyEmail'; email: string }
  /** The store accepted the shopper. */
  | { name: 'signedIn'; user: SignedInUser };

/** What the auth server says of a user; the store sends more, which is not needed here. */
type AuthUser = { name: string; email: string; image?: string | null };

type SignInAnswer = {
  user?: AuthUser;
  twoFactorRedirect?: boolean;
  /** Which second steps the account can use: `totp` when its authenticator is set up. */
  twoFactorMethods?: string[];
};

/** Refusals of a code after which the two-step sign-in is gone: the shopper starts again from the password. */
const ENDS_TWO_FACTOR = new Set([
  'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE',
  'INVALID_TWO_FACTOR_COOKIE',
]);

export function toSignedInUser(user: AuthUser): SignedInUser {
  return { name: user.name, email: user.email, image: user.image ?? null };
}

/** How the sign-in under way began: the email form, or "Continue with Google". */
export type SignInMethod = 'password' | 'google';

/**
 * What the phone's Google SDK could not do, worded as a refusal so the screen
 * shows it where it shows the store's. The codes are the app's own: the store
 * never sends them.
 */
function googleDeviceRefusal(kind: 'noAccount' | 'failed'): AuthRefusal {
  return {
    status: 0,
    code: kind === 'noAccount' ? 'GOOGLE_NO_ACCOUNT' : 'GOOGLE_SIGN_IN_FAILED',
    message: null,
    retryAfterSeconds: null,
    attemptsRemaining: null,
  };
}

/**
 * Signing in with email and password, or with Google, then the second step
 * when the account has two-step verification.
 *
 * Lockout, attempts left and rate limits are the store's; their sentences are
 * in `error`, with the field each concerns. A refusal that is not an error (an
 * email still to confirm) moves to its own step instead.
 *
 * Google is a token from the phone's Google SDK (`GoogleIdToken`), posted to
 * the store's auth server, which answers as it does to a password: a session,
 * or the two-step challenge. Its session is the same as email sign-in's, and
 * the root layout closes the sign-in screens for it in the same way. A
 * shopper who closes Google's picker has done nothing: no error is shown.
 */
export function useSignIn() {
  const { run, fail, clearError, isPending, error } = useAuthTask();
  const [step, setStep] = useState<SignInStep>({ name: 'credentials' });
  const [method, setMethod] = useState<SignInMethod>('password');

  /** Where the store's acceptance leads: the code step, or signed in. */
  const settle = useCallback((answer: SignInAnswer, email: string) => {
    if (answer.twoFactorRedirect) {
      // An older server lists no methods; the authenticator is then the one it has.
      const canUseAuthenticator = answer.twoFactorMethods?.includes('totp') ?? true;
      setStep({
        name: 'twoFactor',
        email,
        method: canUseAuthenticator ? 'totp' : 'backupCode',
        canUseAuthenticator,
      });
    } else if (answer.user) {
      setStep({ name: 'signedIn', user: toSignedInUser(answer.user) });
    }
  }, []);

  const signIn = useCallback(
    async (values: SignInValues) => {
      const email = values.email.trim();
      setMethod('password');
      const outcome = await run<SignInAnswer>((fetchOptions) =>
        authClient.signIn.email({ email, password: values.password }, fetchOptions)
      );
      if (!outcome) return;

      if (outcome.refusal) {
        if (outcome.refusal.code === 'EMAIL_NOT_VERIFIED') setStep({ name: 'verifyEmail', email });
        else fail(outcome.refusal);
        return;
      }
      settle(outcome.data, email);
    },
    [run, fail, settle]
  );

  const signInWithGoogle = useCallback(
    async (google: GoogleIdToken) => {
      if (google.type === 'cancelled') return;
      if (google.type !== 'token') {
        fail(googleDeviceRefusal(google.type));
        return;
      }
      setMethod('google');
      const outcome = await run<SignInAnswer>((fetchOptions) =>
        authClient.signIn.social(
          { provider: 'google', idToken: { token: google.token } },
          fetchOptions
        )
      );
      if (!outcome) return;
      // Google has confirmed the address, so no "check your email" here: every
      // refusal is worded (an account that is not a shopper's, one not linked).
      if (outcome.refusal) {
        fail(outcome.refusal);
        return;
      }
      settle(outcome.data, google.email ?? '');
    },
    [run, fail, settle]
  );

  /** Answers the second step with a code, of the kind the step asks for. */
  const verifyCode = useCallback(
    async (code: string) => {
      if (step.name !== 'twoFactor') return;
      const outcome = await run<{ user: AuthUser }>((fetchOptions) =>
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
      setStep({ name: 'signedIn', user: toSignedInUser(outcome.data.user) });
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

  /** Back to email and password, from the code or from "check your email". */
  const restart = useCallback(() => {
    clearError();
    setStep({ name: 'credentials' });
  }, [clearError]);

  return {
    step,
    isPending,
    /** Which of the two ways is waiting for the store, for the button that shows it. */
    pendingMethod: isPending ? method : null,
    error,
    signIn,
    signInWithGoogle,
    verifyCode,
    switchMethod,
    restart,
  };
}
