import { uploadPhoto } from '@/api/endpoints/uploads';
import { mockFetch } from '@/api/mocks';
import { REQUEST_HEADERS } from '@/contracts/mobile/shop/v1';
import { getSessionCookie } from '@/lib/auth-client';

import { ApiError } from '../errors';

jest.mock('@/api/mocks', () => ({ mockFetch: jest.fn() }));
jest.mock('@/lib/auth-client', () => ({ getSessionCookie: jest.fn() }));
jest.mock('@/lib/device', () => ({
  appInfo: { version: '1.0.0', build: '1', platform: 'ios' },
  getInstallId: () => 'install-1',
}));

const sent = jest.mocked(mockFetch);
const photo = { uri: 'file:///photos/1.jpg', name: '1.jpg', type: 'image/jpeg' };
const upload = {
  id: 'upl-1',
  image: { thumb: 't', card: 'c', full: 'f' },
  mimeType: 'image/jpeg',
  size: 1024,
};

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  sent.mockReset();
  jest.mocked(getSessionCookie).mockReturnValue('better-auth.session_token=abc');
});

describe('uploading a photo', () => {
  it('posts the file in the field `file` with the session and the app’s headers, no JSON type', async () => {
    const append = jest.spyOn(FormData.prototype, 'append');
    sent.mockResolvedValue(answer(201, { success: true, data: upload }));

    await expect(uploadPhoto('en', photo)).resolves.toEqual(upload);

    const [url, init] = sent.mock.calls[0] ?? [];
    expect(String(url)).toMatch(/\/en\/uploads$/);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
    expect(append).toHaveBeenCalledWith('file', photo);
    expect(init?.headers).toMatchObject({
      Cookie: 'better-auth.session_token=abc',
      [REQUEST_HEADERS.installId]: 'install-1',
      [REQUEST_HEADERS.appVersion]: '1.0.0',
    });
    expect(init?.headers).not.toHaveProperty('Content-Type');
    append.mockRestore();
  });

  it('turns the store’s refusal into an ApiError with its reason and sentence', async () => {
    sent.mockResolvedValue(
      answer(413, {
        success: false,
        code: 'VALIDATION_ERROR',
        reason: 'UPLOAD_TOO_LARGE',
        message: 'This photo is larger than the store takes.',
      })
    );

    const error: unknown = await uploadPhoto('en', photo).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 413,
      reason: 'UPLOAD_TOO_LARGE',
      message: 'This photo is larger than the store takes.',
    });
  });
});
