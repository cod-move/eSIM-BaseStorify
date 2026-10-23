import { getInvoice } from '@/api/endpoints/orders';
import { mockFetch } from '@/api/mocks';
import { getSessionCookie } from '@/lib/auth-client';

import { ApiError } from '../errors';

jest.mock('@/api/mocks', () => ({ mockFetch: jest.fn() }));
jest.mock('@/lib/auth-client', () => ({ getSessionCookie: jest.fn() }));
jest.mock('@/lib/device', () => ({
  appInfo: { version: '1.0.0', build: '1', platform: 'ios' },
  getInstallId: () => 'install-1',
}));

const sent = jest.mocked(mockFetch);

const pdf = (bytes: number[]) =>
  new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': 'application/pdf' },
  });

beforeEach(() => {
  sent.mockReset();
  jest.mocked(getSessionCookie).mockReturnValue('better-auth.session_token=abc');
});

describe('downloading the invoice', () => {
  it('sends the shopper’s session and returns the bytes of the file', async () => {
    sent.mockResolvedValue(pdf([37, 80, 68, 70]));

    const bytes = await getInvoice('en', 'o-1');

    expect(Array.from(bytes)).toEqual([37, 80, 68, 70]);
    const [url, init] = sent.mock.calls[0] ?? [];
    expect(String(url)).toContain('/en/orders/o-1/invoice');
    expect(init?.headers).toMatchObject({
      Cookie: 'better-auth.session_token=abc',
      Accept: 'application/pdf',
    });
  });

  it('sends no cookie for a shopper who is not signed in', async () => {
    jest.mocked(getSessionCookie).mockReturnValue('');
    sent.mockResolvedValue(pdf([1]));

    await getInvoice('en', 'o-1');

    expect(sent.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Cookie');
  });

  it('turns the store’s JSON refusal into an ApiError', async () => {
    sent.mockResolvedValue(
      new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'No such order' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    );

    const error: unknown = await getInvoice('en', 'o-9').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('refuses an answer that is not a PDF', async () => {
    sent.mockResolvedValue(
      new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } })
    );

    const error: unknown = await getInvoice('en', 'o-1').catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
