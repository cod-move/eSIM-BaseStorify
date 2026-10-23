/**
 * The signed-in shopper: the profile, the password, deleting the account, and
 * the wishlist as the product page sees it.
 *
 * The auth server keeps its accounts to itself, so this area keeps what it
 * changes: the profile's fields, a changed password, and the deleted accounts.
 * Signing in still checks the auth server's password (see the review file).
 */
import {
  ChangePasswordRequest,
  DeleteAccountRequest,
  UpdateMeRequest,
  type Me,
} from '@/contracts/mobile/shop/v1';
import type * as z from 'zod';

import { PROFILES, type MockProfile } from '../fixtures/account';
import { AUTH_SETTINGS, MOCK_PASSWORD } from '../fixtures/auth';
import { MockError, requireUser, type MockContext, type MockRoute } from '../kit';
import { state, type MockUser } from '../state';

import { reviewStateFor } from './reviews-write';

const profiles = new Map<string, MockProfile>();
const passwords = new Map<string, string>();

export function reset(): void {
  profiles.clear();
  passwords.clear();
}

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/me',
    handle: (ctx) => meOf(requireUser(ctx)),
  },
  {
    method: 'PATCH',
    path: '/me',
    handle: (ctx) => {
      const user = requireUser(ctx);
      const change = parse(UpdateMeRequest, ctx);
      if (change.email !== undefined) {
        throw new MockError(
          403,
          'AUTHORIZATION_ERROR',
          'A shopper changes the login email on the website',
          'EMAIL_CHANGE_NOT_ALLOWED'
        );
      }
      if (change.name !== undefined) renameEverywhere(user, change.name);

      const profile = profileOf(user);
      for (const field of ['phone', 'birthday', 'gender'] as const) {
        const value = change[field];
        if (value === null) delete profile[field];
        else if (value !== undefined) profile[field] = value;
      }
      return meOf(user);
    },
  },
  {
    method: 'POST',
    path: '/me/password',
    handle: (ctx) => {
      const user = requireUser(ctx);
      const { currentPassword, newPassword } = parse(ChangePasswordRequest, ctx);
      const current = passwordOf(user);
      if (!currentPassword) {
        throw refusal('Enter the current password', 'CURRENT_PASSWORD_REQUIRED');
      }
      if (currentPassword !== current) {
        throw refusal('The current password is wrong', 'CURRENT_PASSWORD_INCORRECT');
      }
      if (newPassword === current) {
        throw refusal('The new password is the current one', 'SAME_PASSWORD');
      }
      if (breaksPolicy(newPassword)) {
        throw refusal('The password breaks the store rules', 'PASSWORD_POLICY');
      }
      passwords.set(user.email, newPassword);
      endSessions(user, ctx.user);
      return { mode: 'CHANGED' };
    },
  },
  {
    method: 'DELETE',
    path: '/me',
    handle: (ctx) => {
      const user = requireUser(ctx);
      const { password } = parse(DeleteAccountRequest, ctx);
      if (password !== undefined && password !== passwordOf(user)) {
        throw refusal('The password is wrong', 'PASSWORD_INCORRECT');
      }
      // The orders stay with the store; everything else of the shopper goes.
      profiles.delete(user.id);
      passwords.delete(user.email);
      state.wishlists.delete(user.id);
      state.carts.delete(`user:${user.id}`);
      endSessions(user, null);
      return { deleted: true };
    },
  },
  {
    method: 'GET',
    path: /^\/me\/products\/([^/]+)$/,
    handle: (ctx, [productId = '']) => {
      const user = requireUser(ctx);
      return {
        inWishlist: wishlistOf(user).has(productId),
        ...reviewStateFor(user.id, productId, ctx.locale),
        quoteOffers: [],
      };
    },
  },
  {
    method: 'PUT',
    path: /^\/wishlist\/([^/]+)$/,
    handle: (ctx, [productId = '']) => {
      wishlistOf(requireUser(ctx)).add(productId);
      return { inWishlist: true };
    },
  },
  {
    method: 'DELETE',
    path: /^\/wishlist\/([^/]+)$/,
    handle: (ctx, [productId = '']) => {
      wishlistOf(requireUser(ctx)).delete(productId);
      return { inWishlist: false };
    },
  },
];

function meOf(user: MockUser): Me {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: true,
    ...profileOf(user),
  };
}

function profileOf(user: MockUser): MockProfile {
  let profile = profiles.get(user.id);
  if (!profile) {
    profile = { ...PROFILES[user.email] };
    profiles.set(user.id, profile);
  }
  return profile;
}

function passwordOf(user: MockUser): string {
  return passwords.get(user.email) ?? MOCK_PASSWORD;
}

/** Every session of the shopper carries the new name, as the store's one account row would. */
function renameEverywhere(user: MockUser, name: string): void {
  for (const session of state.sessions.values()) {
    if (session.id === user.id) session.name = name;
  }
}

/** Ends every session of the shopper but `keep`, the one the request came with. */
function endSessions(user: MockUser, keep: MockUser | null): void {
  for (const [token, session] of state.sessions) {
    if (session.id === user.id && session !== keep) state.sessions.delete(token);
  }
}

function breaksPolicy(password: string): boolean {
  const policy = AUTH_SETTINGS.passwordPolicy;
  return (
    password.length < policy.minLength ||
    password.length > policy.maxLength ||
    (policy.requireUppercase && !/[A-Z]/.test(password)) ||
    (policy.requireNumber && !/[0-9]/.test(password)) ||
    (policy.requireSpecialCharacter && !/[^A-Za-z0-9]/.test(password))
  );
}

function refusal(message: string, reason: string): MockError {
  return new MockError(400, 'VALIDATION_ERROR', message, reason);
}

/** The request's body, as the contract has it, or the store's refusal. */
function parse<T>(schema: z.ZodType<T>, ctx: MockContext): T {
  const parsed = schema.safeParse(ctx.body ?? {});
  if (!parsed.success) {
    throw new MockError(400, 'VALIDATION_ERROR', 'The request is not in the contract shape');
  }
  return parsed.data;
}

function wishlistOf(user: MockUser): Set<string> {
  let wishlist = state.wishlists.get(user.id);
  if (!wishlist) {
    wishlist = new Set();
    state.wishlists.set(user.id, wishlist);
  }
  return wishlist;
}
