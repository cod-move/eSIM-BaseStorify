import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { IntlProvider } from 'use-intl';

import * as reviews from '@/api/endpoints/reviews-write';
import { ApiError } from '@/api/errors';
import type { ReviewLimits, WaitingReviews } from '@/contracts/mobile/shop/v1';
import { getMessages } from '@/i18n/messages';

import { MyReviewList } from '../my-review-list';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/features/auth/use-session', () => ({ useSession: () => ({ isSignedIn: true }) }));
jest.mock('@/components/shell/tab-bar', () => ({ useTabBarHeight: () => 0 }));

const limits: ReviewLimits = {
  titleMaxLength: 120,
  textMinLength: 10,
  textMaxLength: 1000,
  maxPhotos: 10,
  photo: { allowedTypes: ['image/jpeg'], maxBytes: 5_000_000 },
  publication: 'AFTER_MODERATION',
  publicationMessage: 'Your review will show once the store has approved it.',
};

const waiting: WaitingReviews = {
  items: [
    {
      product: { id: 'p-1', slug: 'desk-lamp', name: 'Desk lamp' },
      orderId: 'o-234',
      orderNumber: 'ORD000234',
      deliveredAt: '2026-10-01T09:00:00Z',
    },
  ],
  limits,
};

function renderList() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Providers = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <IntlProvider locale="en" messages={getMessages('en')}>
        {children}
      </IntlProvider>
    </QueryClientProvider>
  );
  return render(
    <MyReviewList
      reviews={[]}
      limits={undefined}
      rating={undefined}
      onRating={jest.fn()}
      hasMore={false}
      loadingMore={false}
      onMore={jest.fn()}
      empty={<View testID="empty" />}
    />,
    { wrapper: Providers }
  );
}

afterEach(() => {
  jest.restoreAllMocks();
  mockPush.mockReset();
});

describe('waiting for a review', () => {
  it('shows the waiting products though nothing is rated yet, each opening its product', async () => {
    jest
      .spyOn(reviews, 'getWaitingReviews')
      .mockResolvedValue({ notModified: false, data: waiting, etag: undefined });
    await renderList();

    expect(await screen.findByText('Waiting for your review (1)')).toBeTruthy();
    expect(screen.getByText('Order ORD000234')).toBeTruthy();
    // A quiet line, not the full "No reviews yet", and no "0 products rated".
    expect(screen.getByText('Products you review show here.')).toBeTruthy();
    expect(screen.queryByText('0 products rated')).toBeNull();
    expect(screen.queryByTestId('empty')).toBeNull();

    await fireEvent.press(screen.getByRole('link', { name: 'Open Desk lamp' }));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/products/[slug]',
      params: { slug: 'desk-lamp' },
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Write a review of Desk lamp' }));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/products/[slug]/write-review',
      params: { slug: 'desk-lamp' },
    });
  });

  it('shows the empty state only when nothing is waiting either', async () => {
    jest
      .spyOn(reviews, 'getWaitingReviews')
      .mockResolvedValue({ notModified: false, data: { items: [], limits }, etag: undefined });
    await renderList();

    await waitFor(() => expect(screen.queryByTestId('empty')).not.toBeNull());
    expect(screen.queryByText(/Waiting for your review/)).toBeNull();
  });

  it('says when the waiting products could not be loaded, and tries again', async () => {
    const load = jest
      .spyOn(reviews, 'getWaitingReviews')
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'Something went wrong'))
      .mockResolvedValue({ notModified: false, data: waiting, etag: undefined });
    await renderList();

    expect(
      await screen.findByText('The products waiting for your review couldn’t be loaded.')
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Waiting for your review (1)')).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
