import { useCallback, useState } from 'react';

import { useConfig } from '@/features/config/use-config';
import { useLocale } from '@/i18n/locale-store';
import { authClient } from '@/lib/auth-client';

import { useAuthTask } from './auth-request';
import { RESEND_PAUSE_SECONDS, useWait } from './use-wait';

/**
 * Confirming an email address, while the store sends a link (v1):
 * the link opens the store's website, which confirms the address and
 * asks the shopper to sign in. The app only says "check your email" and can
 * send the link again.
 */

/**
 * Where the link in the email lands once it has confirmed the address: the
 * website's "email confirmed" page, in the app's language, as the website's
 * own sign-up asks for. `undefined` before the store's settings are known: the
 * store then sends the shopper to its home page.
 */
export function useEmailConfirmedPage(): string | undefined {
  const websiteUrl = useConfig().data?.store.websiteUrl;
  const locale = useLocale();
  return websiteUrl ? `${websiteUrl.replace(/\/+$/, '')}/${locale}/email-verified` : undefined;
}

/**
 * "Send the link again" on the "check your email" step. `secondsLeft` counts
 * down the pause after each send, or the wait the store asked for when it
 * refused one; until it reaches 0, `resend` does nothing.
 */
export function useResendVerificationEmail(email: string) {
  const { run, fail, isPending, error } = useAuthTask();
  const { secondsLeft, wait } = useWait();
  const [sent, setSent] = useState(false);
  const callbackURL = useEmailConfirmedPage();

  const resend = useCallback(async () => {
    if (secondsLeft > 0) return;
    const outcome = await run((fetchOptions) =>
      authClient.sendVerificationEmail({ email, callbackURL }, fetchOptions)
    );
    if (!outcome) return;

    if (outcome.refusal) {
      fail(outcome.refusal);
      if (outcome.refusal.retryAfterSeconds) wait(outcome.refusal.retryAfterSeconds);
      return;
    }
    // The store answers the same whether or not a link went out, so as not to
    // tell who has an account: "sent" means "asked for".
    setSent(true);
    wait(RESEND_PAUSE_SECONDS);
  }, [run, fail, wait, secondsLeft, email, callbackURL]);

  return { resend, sent, isPending, error, secondsLeft };
}
