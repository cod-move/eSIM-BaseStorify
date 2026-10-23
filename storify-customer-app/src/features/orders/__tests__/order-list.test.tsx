import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import type { OrderSummary } from '@/contracts/mobile/shop/v1';
import { getMessages } from '@/i18n/messages';

import { OrderList } from '../order-list';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/components/shell/tab-bar', () => ({ useTabBarHeight: () => 0 }));

function InEnglish({ children }: PropsWithChildren) {
  return (
    <IntlProvider locale="en" timeZone="UTC" messages={getMessages('en')}>
      {children}
    </IntlProvider>
  );
}

const delivered: OrderSummary = {
  id: 'o-7',
  number: 'ORD-1007',
  status: 'DELIVERED',
  placedAt: '2026-09-20T10:00:00.000Z',
  itemCount: 1,
  total: { amount: 1200, currency: 'BDT', formatted: '৳1,200.00' },
  shipments: [],
  canReturn: true,
};

it('opens the return request of the order whose "Request return" is pressed', async () => {
  await render(
    <OrderList
      orders={[delivered, { ...delivered, id: 'o-8', number: 'ORD-1008', canReturn: false }]}
      hasMore={false}
      loadingMore={false}
      onMore={jest.fn()}
    />,
    { wrapper: InEnglish }
  );

  const buttons = screen.getAllByRole('button', { name: 'Request return' });
  expect(buttons).toHaveLength(1);
  await fireEvent.press(buttons[0]!);

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/account/returns/request/[orderId]',
    params: { orderId: 'o-7' },
  });
});
