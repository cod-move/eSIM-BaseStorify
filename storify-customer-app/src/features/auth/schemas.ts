import * as z from 'zod';

import type { PasswordPolicy } from '@/contracts/mobile/shop/v1';

import { meetsPolicy } from './password-policy';

/**
 * What each auth form checks before it asks the store. The store checks again
 * and has the last word; these only spare the shopper a round trip.
 *
 * A message here is the key of its translation under `auth.validation`.
 */
export type AuthValidationKey =
  'required' | 'email' | 'nameTooShort' | 'nameTooLong' | 'passwordRules' | 'code';

/** The authenticator's code: six digits, as better-auth makes it. */
export const TOTP_LENGTH = 6;

const email = z.string().trim().min(1, 'required').pipe(z.email('email'));

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'required'),
});
export type SignInValues = z.infer<typeof signInSchema>;

/**
 * Creating an account. The name's limits are the store's (one name, 2 to 100
 * characters, as `PATCH /me` takes it); the password's are the rules the store
 * sent, or none while it has sent none.
 */
export function signUpSchema(policy: PasswordPolicy | null) {
  return z.object({
    name: z.string().trim().min(1, 'required').min(2, 'nameTooShort').max(100, 'nameTooLong'),
    email,
    password: z
      .string()
      .min(1, 'required')
      .refine((password) => meetsPolicy(password, policy), 'passwordRules'),
  });
}
export type SignUpValues = z.infer<ReturnType<typeof signUpSchema>>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

/** A code from the authenticator app. Spaces a shopper types or pastes are dropped. */
export const totpCodeSchema = z
  .string()
  .transform((code) => code.replace(/\s/g, ''))
  .pipe(z.string().regex(new RegExp(`^\\d{${TOTP_LENGTH}}$`), 'code'));

/** One of the backup codes the shopper saved when turning two-step verification on. */
export const backupCodeSchema = z.string().trim().min(1, 'required');
