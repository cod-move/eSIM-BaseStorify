/**
 * The mock store's data for: the shopper's own profile.
 *
 * The auth server knows an account's id, name and email (`fixtures/auth.ts`).
 * What the profile adds, the phone, birthday and gender, is seeded here by
 * email; an account not listed starts with none of them.
 */
import type { Me } from '@/contracts/mobile/shop/v1';

export type MockProfile = Pick<Me, 'phone' | 'birthday' | 'gender'>;

export const PROFILES: Readonly<Record<string, MockProfile>> = {
  'nadia@example.com': { phone: '+880 1712 345678', birthday: '1994-03-12', gender: 'female' },
};
