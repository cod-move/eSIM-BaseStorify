import { useTranslations } from 'use-intl';

import type { PasswordPolicy } from '@/contracts/mobile/shop/v1';
import { useConfig } from '@/features/config/use-config';

/**
 * The store's password rules, shown as the shopper types.
 *
 * The rules come from the store's settings (`GET /config`, `auth`), and are
 * checked the way the store checks them, so the list ticks exactly when the
 * store will accept the password. The store still decides: whatever it
 * refuses comes back as `PASSWORD_POLICY` and is shown by the field.
 */

export type PasswordRule = 'minLength' | 'maxLength' | 'uppercase' | 'number' | 'special';

export type PasswordCheck = {
  rule: PasswordRule;
  met: boolean;
};

/** The store's rules, or `null` while it has not said (the store alone then checks). */
export function usePasswordPolicy(): PasswordPolicy | null {
  return useConfig().data?.auth?.passwordPolicy ?? null;
}

/** Each rule the store has turned on, and whether the password meets it, in the order they are shown. */
export function checkPassword(password: string, policy: PasswordPolicy): PasswordCheck[] {
  const checks: PasswordCheck[] = [{ rule: 'minLength', met: password.length >= policy.minLength }];
  // The longest password is no rule to tick, only one to say when it is broken.
  if (password.length > policy.maxLength) checks.push({ rule: 'maxLength', met: false });
  // The same tests as the store's own: an ASCII capital, an ASCII digit, and
  // anything that is neither a letter nor a digit.
  if (policy.requireUppercase) checks.push({ rule: 'uppercase', met: /[A-Z]/.test(password) });
  if (policy.requireNumber) checks.push({ rule: 'number', met: /[0-9]/.test(password) });
  if (policy.requireSpecialCharacter) {
    checks.push({ rule: 'special', met: /[^A-Za-z0-9]/.test(password) });
  }
  return checks;
}

export function meetsPolicy(password: string, policy: PasswordPolicy | null): boolean {
  return !policy || checkPassword(password, policy).every((check) => check.met);
}

/** The checklist under a new-password field, worded. Empty while the store has not sent its rules. */
export function usePasswordChecklist(
  password: string
): { rule: PasswordRule; label: string; met: boolean }[] {
  const policy = usePasswordPolicy();
  const t = useTranslations('auth.passwordRules');
  if (!policy) return [];

  return checkPassword(password, policy).map((check) => ({
    ...check,
    label:
      check.rule === 'minLength' || check.rule === 'maxLength'
        ? t(check.rule, { count: check.rule === 'minLength' ? policy.minLength : policy.maxLength })
        : t(check.rule),
  }));
}
