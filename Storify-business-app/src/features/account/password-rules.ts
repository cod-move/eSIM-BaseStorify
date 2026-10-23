import type { PasswordPolicy } from '@/contracts/mobile/biz/v1';

export type PasswordRuleKind = 'minLength' | 'maxLength' | 'uppercase' | 'number' | 'special';

export type PasswordRule = { kind: PasswordRuleKind; count?: number; met: boolean };

/**
 * The store's password rules (GET /config, `auth.passwordPolicy`), each with
 * whether `password` meets it, so the form can tick them as the operator
 * types. Each test is the store's own (`lib/auth/password-policy.ts` in the
 * web app), so the list never passes a password the store refuses; the store
 * checks again when it is sent, and its word wins.
 */
export function passwordRules(
  policy: PasswordPolicy | undefined,
  password: string
): PasswordRule[] {
  if (!policy) return [];
  const rules: PasswordRule[] = [
    { kind: 'minLength', count: policy.minLength, met: password.length >= policy.minLength },
  ];
  // Shown only once it is broken: nobody types 128 characters by accident.
  if (password.length > policy.maxLength) {
    rules.push({ kind: 'maxLength', count: policy.maxLength, met: false });
  }
  if (policy.requireUppercase) rules.push({ kind: 'uppercase', met: /[A-Z]/.test(password) });
  if (policy.requireNumber) rules.push({ kind: 'number', met: /[0-9]/.test(password) });
  if (policy.requireSpecialCharacter) {
    rules.push({ kind: 'special', met: /[^A-Za-z0-9]/.test(password) });
  }
  return rules;
}
