import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { ME_QUERIES } from '@/api/query-keys';
import { authClient } from '@/lib/auth-client';

import { useAuthTask } from './auth-request';

/**
 * The account's password and two-step verification, through the store's own
 * `/api/auth/*` (the business API has no endpoint for them): the store's
 * password rules, rate limits and audit log apply there. The rules are in
 * `GET /config` (`auth.passwordPolicy`) to check a new password before it is
 * sent; the store checks again.
 */

/**
 * Changes the password. Every other device signed in to the account is
 * signed out; this one stays.
 */
export function useChangePassword() {
  const { run, fail, clearError, isPending, error } = useAuthTask();
  const [done, setDone] = useState(false);

  const changePassword = useCallback(
    async (values: { currentPassword: string; newPassword: string }) => {
      setDone(false);
      const outcome = await run<unknown>((fetchOptions) =>
        authClient.changePassword({ ...values, revokeOtherSessions: true }, fetchOptions)
      );
      if (!outcome) return false;
      if (outcome.refusal) {
        fail(outcome.refusal);
        return false;
      }
      setDone(true);
      return true;
    },
    [run, fail]
  );

  return { changePassword, done, isPending, error, clearError };
}

/** Turning two-step verification on: the authenticator's link and the backup codes to keep. */
export type TwoFactorSetup = { totpURI: string; backupCodes: string[] };

/**
 * Two-step verification, on and off.
 *
 * On takes two steps: `start` with the password answers the link for the
 * authenticator app (as a QR code or to open) and the backup codes; `confirm`
 * with the first code the authenticator shows turns it on. Off takes the
 * password. GET /me is read again after each, for `twoFactorEnabled`.
 */
export function useTwoFactorSettings() {
  const queryClient = useQueryClient();
  const { run, fail, clearError, isPending, error } = useAuthTask();
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);

  const refreshMe = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: ME_QUERIES }),
    [queryClient]
  );

  const start = useCallback(
    async (password: string) => {
      const outcome = await run<TwoFactorSetup>((fetchOptions) =>
        authClient.twoFactor.enable({ password }, fetchOptions)
      );
      if (!outcome) return false;
      if (outcome.refusal) {
        fail(outcome.refusal);
        return false;
      }
      setSetup(outcome.data);
      return true;
    },
    [run, fail]
  );

  const confirm = useCallback(
    async (code: string) => {
      const outcome = await run<unknown>((fetchOptions) =>
        authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, '') }, fetchOptions)
      );
      if (!outcome) return false;
      if (outcome.refusal) {
        fail(outcome.refusal);
        return false;
      }
      setSetup(null);
      refreshMe();
      return true;
    },
    [run, fail, refreshMe]
  );

  const disable = useCallback(
    async (password: string) => {
      const outcome = await run<unknown>((fetchOptions) =>
        authClient.twoFactor.disable({ password }, fetchOptions)
      );
      if (!outcome) return false;
      if (outcome.refusal) {
        fail(outcome.refusal);
        return false;
      }
      refreshMe();
      return true;
    },
    [run, fail, refreshMe]
  );

  return { setup, start, confirm, disable, isPending, error, clearError };
}
