import type * as z from 'zod';

import { API_BASE_PATH, type Workspace } from '@/contracts/mobile/biz/v1';

import { MOCK_PASSWORD, mockFetch } from '../mocks/server';

/**
 * The mock store is only useful if it answers like the real one. Every answer
 * it gives is held against the contract in the test of its area,
 * `mock-<area>.test.ts`, so a screen built on mock data is built on the shape
 * the API has. These are the helpers those tests share.
 */

export const ORIGIN = 'https://mock.storify.invalid';

type CallOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  locale?: string;
};

export async function call(path: string, init: CallOptions = {}) {
  const response = await mockFetch(`${ORIGIN}${API_BASE_PATH}/${init.locale ?? 'en'}${path}`, {
    method: init.method,
    headers: init.headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : undefined };
}

/** The answer's data, after checking the status, the envelope and the contract. */
export async function dataOf<T>(schema: z.ZodType<T>, path: string, init: CallOptions = {}) {
  const { response, body } = await call(path, init);
  expect({ status: response.status, body }).toMatchObject({ status: 200, body: { success: true } });
  return schema.parse(body.data);
}

/** A refusal's envelope, after checking its status and code. */
export async function refusalOf(
  status: number,
  code: string,
  path: string,
  init: CallOptions = {}
) {
  const { response, body } = await call(path, init);
  expect({ status: response.status, code: body?.code }).toEqual({ status, code });
  return body as {
    reason?: string;
    details?: Record<string, unknown>;
    errors?: Record<string, string[]>;
  };
}

/** Signs in as the auth client does; the answer and the session cookie. */
export async function signInAs(email: string, password = MOCK_PASSWORD) {
  const response = await mockFetch(`${ORIGIN}/api/auth/sign-in/email`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  return { response, cookie };
}

/** The headers of a signed-in operator's request, in a workspace when one is named. */
export async function as(email: string, workspace?: Workspace): Promise<Record<string, string>> {
  const { response, cookie } = await signInAs(email);
  expect(response.status).toBe(200);
  return { Cookie: cookie, ...(workspace ? { 'X-Workspace': workspace } : {}) };
}

/** The headers of a change made once per key. */
export function keyed(headers: Record<string, string>, key: string): Record<string, string> {
  return { ...headers, 'Idempotency-Key': key };
}
