import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { IntlProvider } from 'use-intl';

import * as reviews from '@/api/endpoints/reviews-write';
import { ApiError } from '@/api/errors';
import type { MyReview, MyReviewList, ReviewLimits } from '@/contracts/mobile/shop/v1';
import type { ReviewDraft } from '@/features/reviews-write/review-draft';
import { getMessages } from '@/i18n/messages';

import { EditReview } from '../edit-review';
import { useEditReview, useMyReviews } from '../use-my-reviews';

jest.mock('@/features/auth/use-session', () => ({ useSession: () => ({ isSignedIn: true }) }));

const limits: ReviewLimits = {
  titleMaxLength: 120,
  textMinLength: 10,
  textMaxLength: 1000,
  maxPhotos: 10,
  photo: { allowedTypes: ['image/jpeg'], maxBytes: 5_000_000 },
  publication: 'AFTER_MODERATION',
  publicationMessage: 'Your review will show once the store has approved it.',
};

const photo = {
  id: 'ph-1',
  image: {
    thumb: 'https://img.test/t.jpg',
    card: 'https://img.test/c.jpg',
    full: 'https://img.test/f.jpg',
  },
};

const review: MyReview = {
  id: 'rev-1',
  product: { id: 'p-1', slug: 'bag', name: 'Canvas bag' },
  rating: 4,
  title: 'Good bag',
  text: 'Sturdy and light, holds a lot.',
  photos: [photo],
  status: 'PUBLISHED',
  statusMessage: 'Published',
  canEdit: true,
  verifiedPurchase: true,
  createdAt: '2026-09-27T10:00:00Z',
};

const page: MyReviewList = { items: [review], nextCursor: null, limits };

function providers() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <IntlProvider locale="en" messages={getMessages('en')}>
          {children}
        </IntlProvider>
      </QueryClientProvider>
    );
  };
}

afterEach(() => jest.restoreAllMocks());

describe('my reviews', () => {
  it('asks the store with the rating chosen, and without one for All', async () => {
    const list = jest
      .spyOn(reviews, 'getMyReviews')
      .mockResolvedValue({ notModified: false, data: page, etag: undefined });
    const hook = await renderHook(
      ({ rating }: { rating: number | undefined }) => useMyReviews(rating),
      { wrapper: providers(), initialProps: { rating: 4 } }
    );

    await waitFor(() => expect(hook.result.current.data?.reviews).toEqual([review]));
    expect(list.mock.calls[0]?.[1]).toMatchObject({ rating: 4 });

    await hook.rerender({ rating: undefined });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(list.mock.calls[1]?.[1].rating).toBeUndefined();
  });

  it('sends an edit as one PATCH, once for a double tap', async () => {
    const update = jest.spyOn(reviews, 'updateReview').mockResolvedValue(review);
    const draft: ReviewDraft = {
      rating: 5,
      title: '  ',
      text: ' Even better after a month. ',
      photos: [{ kind: 'kept', photo }],
    };
    const hook = await renderHook(() => useEditReview(review), { wrapper: providers() });

    await act(async () => {
      hook.result.current.submit(draft);
      hook.result.current.submit(draft);
    });

    await waitFor(() => expect(hook.result.current.saved).toEqual(review));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.slice(1)).toEqual([
      'rev-1',
      { rating: 5, title: null, text: 'Even better after a month.', photoIds: ['ph-1'] },
    ]);
  });

  it('shows the store’s own message when it refuses the edit with NOT_EDITABLE', async () => {
    const message = 'The store took this review down, so it can no longer be changed.';
    jest
      .spyOn(reviews, 'updateReview')
      .mockRejectedValue(new ApiError(409, 'CONFLICT', message, { reason: 'NOT_EDITABLE' }));
    await render(<EditReview review={review} limits={limits} onDone={jest.fn()} />, {
      wrapper: providers(),
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
  });
});
