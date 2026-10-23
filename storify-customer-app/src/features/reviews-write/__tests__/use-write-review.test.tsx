import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import * as reviews from '@/api/endpoints/reviews-write';
import * as uploads from '@/api/endpoints/uploads';
import { NetworkError } from '@/api/errors';
import type { MyReview, Upload } from '@/contracts/mobile/shop/v1';
import type { ReviewDraft } from '@/features/reviews-write/review-draft';
import { useWriteReview } from '@/features/reviews-write/use-write-review';

let mockKeys = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `key-${++mockKeys}` }));

const file = (n: number) => ({ uri: `file:///${n}.jpg`, name: `${n}.jpg`, type: 'image/jpeg' });
const draft: ReviewDraft = {
  rating: 4,
  title: ' Good ',
  text: 'Sturdy and light.',
  photos: [
    { kind: 'picked', file: file(1) },
    { kind: 'picked', file: file(2) },
  ],
};

let upload: jest.SpiedFunction<typeof uploads.uploadPhoto>;
let create: jest.SpiedFunction<typeof reviews.createReview>;

beforeEach(() => {
  let n = 0;
  upload = jest
    .spyOn(uploads, 'uploadPhoto')
    .mockImplementation(async () => ({ id: `upl-${++n}` }) as Upload);
  create = jest.spyOn(reviews, 'createReview').mockResolvedValue({ id: 'rev-1' } as MyReview);
});
afterEach(() => jest.restoreAllMocks());

function renderSending() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useWriteReview({ id: 'p-1', slug: 'bag' }), { wrapper });
}

describe('sending a review', () => {
  it('uploads the photos first, then names their ids in the review', async () => {
    const sending = await renderSending();

    await act(async () => sending.result.current.submit(draft));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(upload.mock.calls.map(([, sentFile]) => sentFile)).toEqual([file(1), file(2)]);
    const lastUpload = Math.max(...upload.mock.invocationCallOrder);
    expect(create.mock.invocationCallOrder[0]).toBeGreaterThan(lastUpload);
    expect(create.mock.calls[0]?.[2]).toEqual({
      rating: 4,
      title: 'Good',
      text: 'Sturdy and light.',
      uploadIds: ['upl-1', 'upl-2'],
    });
  });

  it('sends once for a double tap, and retries with the same key and the photos already sent', async () => {
    create.mockRejectedValueOnce(new NetworkError('timeout'));
    const sending = await renderSending();

    await act(async () => {
      sending.result.current.submit(draft);
      sending.result.current.submit(draft);
    });
    await waitFor(() => expect(sending.result.current.error).toBeInstanceOf(NetworkError));
    expect(create).toHaveBeenCalledTimes(1);

    await act(async () => sending.result.current.submit(draft));
    await waitFor(() => expect(sending.result.current.review).toEqual({ id: 'rev-1' }));

    expect(create).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenCalledTimes(2);
    const [first, second] = create.mock.calls;
    expect(first?.[3]).toMatch(/^key-/);
    expect(second?.[3]).toBe(first?.[3]);
    expect(second?.[2]).toEqual(first?.[2]);
  });
});
