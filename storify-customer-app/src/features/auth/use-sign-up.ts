import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { getMe } from '@/api/endpoints/me';
import { isApiError } from '@/api/errors';
import { queryKeys } from '@/api/query-keys';
import { useLocale } from '@/i18n/locale-store';
import { authClient } from '@/lib/auth-client';

import { useAuthTask, type AuthRefusal } from './auth-request';
import { signUpSchema, type SignUpValues } from './schemas';
import { usePasswordPolicy } from './password-policy';
import { useEmailConfirmedPage } from './use-email-verification';
import { toSignedInUser, type SignedInUser } from './use-sign-in';

export type SignUpStep =
  /** Name, email and password. */
  | { name: 'form' }
  /**
   * The account exists and the store wants its email confirmed: "check your
   * email" (by link in v1), with `useResendVerificationEmail`.
   */
  | { name: 'verifyEmail'; email: string }
  /** The account exists and is signed in. */
  | { name: 'signedIn'; user: SignedInUser };

type SignUpAnswer = {
  user: { name: string; email: string; image?: string | null; emailVerified: boolean };
};

/**
 * Creating an account.
 *
 * The store's password rules come from its settings: `policy` is for the
 * checklist under the password field (see `usePasswordChecklist`), and `schema`
 * checks the form against the same rules.
 *
 * The store opens a session with the new account. Whether it also wants the
 * email confirmed first, it shows only by refusing that session: so an account
 * whose email is not confirmed is asked about with `GET /me`. A refusal moves to
 * "check your email", and the session stays: it starts working by itself once
 * the link is followed (`useSession`).
 */
export function useSignUp() {
  const { run, fail, clearError, isPending, error } = useAuthTask();
  const [step, setStep] = useState<SignUpStep>({ name: 'form' });
  const callbackURL = useEmailConfirmedPage();
  const locale = useLocale();
  const queryClient = useQueryClient();

  const policy = usePasswordPolicy();
  const schema = useMemo(() => signUpSchema(policy), [policy]);

  const signUp = useCallback(
    async (values: SignUpValues) => {
      const email = values.email.trim();
      const outcome = await run<SignUpAnswer>((fetchOptions) =>
        authClient.signUp.email(
          { name: values.name.trim(), email, password: values.password, callbackURL },
          fetchOptions
        )
      );
      if (!outcome) return;
      if (outcome.refusal) {
        fail(outcome.refusal);
        return;
      }

      const { user } = outcome.data;
      const session = user.emailVerified ? 'accepted' : await askStore(queryClient, locale);
      if (session === 'accepted') {
        setStep({ name: 'signedIn', user: toSignedInUser(user) });
      } else if (session === 'refused') {
        setStep({ name: 'verifyEmail', email });
      } else {
        fail(session);
      }
    },
    [run, fail, callbackURL, queryClient, locale]
  );

  /** "Change email address": back to the form, as it was filled in. */
  const changeEmail = useCallback(() => {
    clearError();
    setStep({ name: 'form' });
  }, [clearError]);

  return { step, isPending, error, signUp, changeEmail, policy, schema };
}

/**
 * Whether the store accepts the session it just opened. Only a 401 is a
 * refusal (it wants the email confirmed first); any other failure is not an
 * answer to that question, and the form shows it as an error.
 */
async function askStore(
  queryClient: ReturnType<typeof useQueryClient>,
  locale: string
): Promise<'accepted' | 'refused' | AuthRefusal> {
  try {
    await queryClient.fetchQuery({
      queryKey: queryKeys.me(locale),
      queryFn: ({ signal }) => getMe(locale, signal),
      staleTime: 0,
    });
    return 'accepted';
  } catch (error) {
    if (!isApiError(error)) return NO_ANSWER;
    if (error.status === 401) return 'refused';
    return { ...NO_ANSWER, status: error.status, code: error.code };
  }
}

/** A failure that carries nothing to word but itself: the form shows the generic sentence. */
const NO_ANSWER: AuthRefusal = {
  status: 0,
  code: null,
  message: null,
  retryAfterSeconds: null,
  attemptsRemaining: null,
};
