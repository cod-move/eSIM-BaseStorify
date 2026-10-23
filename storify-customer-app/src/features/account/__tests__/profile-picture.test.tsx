import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import * as meEndpoints from '@/api/endpoints/me';
import * as uploads from '@/api/endpoints/uploads';
import { ApiError } from '@/api/errors';
import { queryKeys } from '@/api/query-keys';
import type { Me, Upload } from '@/contracts/mobile/shop/v1';
import { usePictureChange } from '@/features/account/profile-form';
import { useLocale } from '@/i18n/locale-store';

jest.mock('expo-image-picker', () => ({}));

const file = { uri: 'file:///me.jpg', name: 'me.jpg', type: 'image/jpeg' };
const picture = (name: string) => ({ thumb: name, card: name, full: name });
const before: Me = {
  id: 'u-1',
  name: 'Rafi',
  email: 'rafi@example.com',
  emailVerified: true,
  image: picture('old'),
};

let upload: jest.SpiedFunction<typeof uploads.uploadPhoto>;
let update: jest.SpiedFunction<typeof meEndpoints.updateMe>;

beforeEach(() => {
  upload = jest.spyOn(uploads, 'uploadPhoto').mockResolvedValue({ id: 'upl-7' } as Upload);
  update = jest.spyOn(meEndpoints, 'updateMe').mockImplementation(async (_locale, body) => ({
    ...before,
    image: body.imageUploadId ? picture(body.imageUploadId) : undefined,
  }));
});
afterEach(() => jest.restoreAllMocks());

async function renderChange() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = await renderHook(() => ({ change: usePictureChange(), locale: useLocale() }), {
    wrapper,
  });
  client.setQueryData(queryKeys.me(view.result.current.locale), before);
  const cached = () => client.getQueryData<Me>(queryKeys.me(view.result.current.locale));
  return { view, cached };
}

describe('changing the profile picture', () => {
  it('uploads the chosen photo once, then saves the profile with its id', async () => {
    const { view, cached } = await renderChange();

    await act(async () => view.result.current.change.mutate(file));

    await waitFor(() => expect(view.result.current.change.isSuccess).toBe(true));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0]?.[1]).toEqual(file);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[1]).toEqual({ imageUploadId: 'upl-7' });
    expect(update.mock.invocationCallOrder[0]).toBeGreaterThan(
      upload.mock.invocationCallOrder[0] ?? 0
    );
    expect(cached()?.image).toEqual(picture('upl-7'));
  });

  it('removes the picture by sending null, without an upload', async () => {
    const { view, cached } = await renderChange();

    await act(async () => view.result.current.change.mutate(null));

    await waitFor(() => expect(view.result.current.change.isSuccess).toBe(true));
    expect(upload).not.toHaveBeenCalled();
    expect(update.mock.calls[0]?.[1]).toEqual({ imageUploadId: null });
    expect(cached()?.image).toBeUndefined();
  });

  it('keeps the old picture and the store’s message when the upload is refused', async () => {
    upload.mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'That file is not a picture.', {
        reason: 'UPLOAD_UNREADABLE',
      })
    );
    const { view, cached } = await renderChange();

    await act(async () => view.result.current.change.mutate(file));

    await waitFor(() => expect(view.result.current.change.isError).toBe(true));
    expect(update).not.toHaveBeenCalled();
    expect(view.result.current.change.error?.message).toBe('That file is not a picture.');
    expect(cached()).toEqual(before);
  });
});
