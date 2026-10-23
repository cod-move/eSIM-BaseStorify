import type * as z from 'zod';

import { API_BASE_PATH } from '@/contracts/mobile/shop/v1';

import { MOCK_PASSWORD, mockFetch } from '../mocks/server';

/**
 * The mock store is only useful if it answers like the real one. Every answer
 * it gives is held against the contract in the test of its area,
 * `mock-<area>.test.ts`, so a screen built on mock data is built on the shape
 * the API will have. These are the helpers those tests share.
 */

export const ORIGIN = 'https://mock.storify.invalid';

export async function call(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string>; locale?: string } = {}
) {
  const response = await mockFetch(`${ORIGIN}${API_BASE_PATH}/${init.locale ?? 'en'}${path}`, {
    method: init.method,
    headers: init.headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : undefined };
}

/** The answer's data, after checking the envelope and the contract. */
export async function dataOf<T>(
  schema: z.ZodType<T>,
  ...args: Parameters<typeof call>
): Promise<T> {
  const { response, body } = await call(...args);
  expect(response.status).toBe(200);
  expect(body.success).toBe(true);
  return schema.parse(body.data);
}

/** Signs in as the auth client does, and gives the session cookie to send with a request. */
export async function signIn() {
  const response = await mockFetch(`${ORIGIN}/api/auth/sign-in/email`, {
    method: 'POST',
    body: JSON.stringify({ email: 'nadia@example.com', password: MOCK_PASSWORD }),
  });
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  return { response, headers: { Cookie: cookie } };
}
